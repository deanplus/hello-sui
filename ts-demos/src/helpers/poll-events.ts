import { SuiClient, SuiEventFilter, EventId } from '@mysten/sui/client';
import * as rpcHelper from '../helpers/rpc';

export async function getEventDatasByEventType(
  eventType: string,
  options?: {
    queryOptions?: {
      limit?: number;
      order?: 'ascending' | 'descending';
      cursor?: EventId;
    };
    handler?: (event: any) => Promise<void>;
    client?: SuiClient;
  }
) {
  const SuiClient = options?.client || rpcHelper.getSuiClient();

  const limit = options?.queryOptions?.limit || 50;
  const order = options?.queryOptions?.order || 'ascending';
  const cursor = options?.queryOptions?.cursor || null;

  try {
    const response = await SuiClient.queryEvents({
      query: {
        MoveEventType: eventType,
      } as SuiEventFilter,
      limit,
      order,
      cursor,
    });

    const eventDatas = response.data;

    // Process events
    for (const eventData of eventDatas) {
      if (options?.handler) {
        await options.handler(eventData);
      }
    }
    return eventDatas;
  } catch (error) {
    console.error('Failed to query events:', error);
    throw error;
  }
}
