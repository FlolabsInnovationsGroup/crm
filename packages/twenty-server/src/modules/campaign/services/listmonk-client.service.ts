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

  async request<TData>({
    method,
    path,
    body,
  }: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    body?: unknown;
  }): Promise<TData> {
    const connection = this.getConnection();

    if (connection === null) {
      throw new UserInputError('No campaign server is connected', {
        userFriendlyMessage: msg`No campaign server is connected to this CRM.`,
      });
    }

    const response = await fetch(`${connection.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: connection.authorization,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_IN_MILLISECONDS),
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        isPlainObject(payload) && isString(payload.message)
          ? payload.message
          : `HTTP ${response.status}`;

      throw new UserInputError(`Campaign server: ${message}`, {
        userFriendlyMessage: msg`The campaign server refused: ${message}`,
      });
    }

    return (isPlainObject(payload) ? payload.data : undefined) as TData;
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
