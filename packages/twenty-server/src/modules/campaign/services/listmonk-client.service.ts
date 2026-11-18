import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { isNonEmptyString, isString } from '@sniptt/guards';
import { isPlainObject } from 'twenty-shared/utils';

import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';

const REQUEST_TIMEOUT_IN_MILLISECONDS = 15000;

type ListmonkConnection = {
  baseUrl: string;
  authorization: string;
};

// Listmonk answers with {"data": …} or, on failure, {"message": "…"}.
@Injectable()
export class ListmonkClientService {
  isConfigured(): boolean {
    return this.getConnection() !== null;
  }

  // Statuses in ignoredErrorStatuses resolve to null instead of throwing.
  async request<TData>({
    method,
    path,
    body,
    ignoredErrorStatuses = [],
  }: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    body?: unknown;
    ignoredErrorStatuses?: number[];
  }): Promise<TData> {
    const connection = this.getConnection();

    if (connection === null) {
      throw new UserInputError('No campaign server is connected', {
        userFriendlyMessage: msg`No campaign server is connected to this CRM.`,
      });
    }

    let response: Response;

    try {
      response = await fetch(`${connection.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: connection.authorization,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_IN_MILLISECONDS),
      });
    } catch {
      throw new UserInputError('Campaign server unreachable', {
        userFriendlyMessage: msg`The campaign server did not answer. Try again in a minute.`,
      });
    }

    const payload: unknown = await response.json().catch(() => null);

    if (ignoredErrorStatuses.includes(response.status)) {
      return null as TData;
    }

    if (!response.ok) {
      const message =
        isPlainObject(payload) && isString(payload.message)
          ? payload.message
          : `HTTP ${response.status}`;

      throw new UserInputError(`Campaign server: ${message}`, {
        userFriendlyMessage: msg`The campaign server refused: ${message}`,
      });
    }

    // A proxy error page can come back as 200 without Listmonk's JSON envelope.
    if (!isPlainObject(payload) || !('data' in payload)) {
      throw new UserInputError('Unexpected campaign server answer', {
        userFriendlyMessage: msg`The campaign server sent an unexpected answer.`,
      });
    }

    return payload.data as TData;
  }

  private getConnection(): ListmonkConnection | null {
    const baseUrl = process.env.LISTMONK_API_URL;
    const apiUser = process.env.LISTMONK_API_USER;
    const apiToken = process.env.LISTMONK_API_TOKEN;

    if (
      !isNonEmptyString(baseUrl) ||
      !isNonEmptyString(apiUser) ||
      !isNonEmptyString(apiToken)
    ) {
      return null;
    }

    return {
      baseUrl: baseUrl.replace(/\/$/, ''),
      authorization: `token ${apiUser}:${apiToken}`,
    };
  }
}
