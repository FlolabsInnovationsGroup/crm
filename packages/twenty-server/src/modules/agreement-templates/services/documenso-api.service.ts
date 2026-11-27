import { Injectable } from '@nestjs/common';

import { type AgreementSigningConfig } from 'src/modules/agreement-templates/utils/get-agreement-signing-config.util';
import {
  type DocumensoEnvelope,
  type DocumensoNewRecipient,
} from 'src/modules/agreement-templates/types/documenso-envelope.type';

const REQUEST_TIMEOUT_MS = 30_000;
const TITLE_MAX_LENGTH = 255;

type DocumensoConnection = Pick<
  AgreementSigningConfig,
  'documensoApiUrl' | 'documensoApiToken'
>;

// Documenso v2 API (https://openapi.documenso.com). The CRM sends every email
// itself, so envelopes are distributed with no Documenso emails.
@Injectable()
export class DocumensoApiService {
  async createEnvelope(
    connection: DocumensoConnection,
    {
      title,
      externalId,
      files,
      recipients,
    }: {
      title: string;
      externalId: string;
      files: { filename: string; pdf: Buffer }[];
      recipients: DocumensoNewRecipient[];
    },
  ): Promise<string> {
    const form = new FormData();

    form.append(
      'payload',
      JSON.stringify({
        title: title.slice(0, TITLE_MAX_LENGTH),
        type: 'DOCUMENT',
        externalId,
        recipients,
        meta: { signingOrder: 'SEQUENTIAL', distributionMethod: 'NONE' },
      }),
    );

    for (const { filename, pdf } of files) {
      form.append(
        'files',
        new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
        filename,
      );
    }

    const body = await this.request<{ id: string }>(
      connection,
      'POST',
      '/envelope/create',
      form,
    );

    return body.id;
  }

  async distribute(
    connection: DocumensoConnection,
    envelopeId: string,
  ): Promise<{ email: string; signingUrl: string }[]> {
    const body = await this.request<{
      recipients: { email: string; signingUrl: string }[];
    }>(
      connection,
      'POST',
      '/envelope/distribute',
      JSON.stringify({ envelopeId, meta: { distributionMethod: 'NONE' } }),
    );

    return body.recipients;
  }

  async getEnvelope(
    connection: DocumensoConnection,
    envelopeId: string,
  ): Promise<DocumensoEnvelope> {
    return this.request<DocumensoEnvelope>(
      connection,
      'GET',
      `/envelope/${encodeURIComponent(envelopeId)}`,
    );
  }

  async deleteEnvelope(
    connection: DocumensoConnection,
    envelopeId: string,
  ): Promise<void> {
    await this.request(
      connection,
      'POST',
      '/envelope/delete',
      JSON.stringify({ envelopeId }),
    );
  }

  async downloadSignedItem(
    connection: DocumensoConnection,
    envelopeItemId: string,
  ): Promise<Buffer> {
    return this.download(
      connection,
      `/envelope/item/${encodeURIComponent(envelopeItemId)}/download?version=signed`,
    );
  }

  async downloadCertificate(
    connection: DocumensoConnection,
    envelopeId: string,
  ): Promise<Buffer> {
    return this.download(
      connection,
      `/envelope/${encodeURIComponent(envelopeId)}/certificate/download`,
    );
  }

  private async send(
    connection: DocumensoConnection,
    method: 'GET' | 'POST',
    path: string,
    body?: FormData | string,
  ): Promise<Response> {
    const response = await fetch(
      `${connection.documensoApiUrl}/api/v2${path}`,
      {
        method,
        headers: {
          authorization: connection.documensoApiToken,
          ...(typeof body === 'string'
            ? { 'content-type': 'application/json' }
            : {}),
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      // Documenso's error bodies are short JSON messages, never secrets.
      const detail = (await response.text().catch(() => '')).slice(0, 300);

      throw new Error(
        `Documenso answered ${response.status} for ${method} ${path.split('?')[0]}: ${detail}`,
      );
    }

    return response;
  }

  private async request<TBody>(
    connection: DocumensoConnection,
    method: 'GET' | 'POST',
    path: string,
    body?: FormData | string,
  ): Promise<TBody> {
    const response = await this.send(connection, method, path, body);

    return (await response.json()) as TBody;
  }

  private async download(
    connection: DocumensoConnection,
    path: string,
  ): Promise<Buffer> {
    const response = await this.send(connection, 'GET', path);

    return Buffer.from(await response.arrayBuffer());
  }
}
