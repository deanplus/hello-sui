import { SuiClient, SuiEvent, EventId, SuiEventFilter } from '@mysten/sui/client';
import { getSuiClient } from './rpc';
import * as rpcHelper from '../helpers/rpc';

const MAX_EVENTS_PER_TIME = 50;
export async function getEventsByTxDigest(
  txDigest: string,
  suiClient?: SuiClient
): Promise<SuiEvent[]> {
  if (!suiClient) suiClient = getSuiClient();

  const events = await suiClient.queryEvents({
    query: {
      Transaction: txDigest,
    },
  });

  const eventsDataLength = events.data.length;
  if (eventsDataLength == 0) return [];

  return events.data;
}

export async function getEventByEventId(
  eventId: EventId,
  suiClient?: SuiClient
): Promise<SuiEvent | null> {
  if (!suiClient) suiClient = getSuiClient();

  const events = await suiClient.queryEvents({
    query: {
      Transaction: eventId.txDigest,
    },
  });

  const eventDatas = events.data;
  const eventsDataLength = eventDatas.length;
  if (eventsDataLength == 0) return null;

  const targetEventData = eventDatas.find(event => event.id.eventSeq === eventId.eventSeq) || null;

  return targetEventData;
}

export async function getLatestEvents(
  eventType: string,
  limit?: number,
  cursor?: EventId | null,
  suiClient?: SuiClient
): Promise<SuiEvent[]> {
  if (!limit) limit = MAX_EVENTS_PER_TIME;
  if (!suiClient) suiClient = getSuiClient();

  const events = await suiClient.queryEvents({
    query: {
      MoveEventType: eventType,
    },
    limit: Math.min(limit, MAX_EVENTS_PER_TIME), // 每次查询最多 50 个事件
    order: 'descending', // 最新的事件在前
    cursor,
  });

  return events.data;
}

export async function getEventDatasByEventType(
  eventType: string,
  options?: {
    queryOptions?: {
      limit?: number;
      order?: 'ascending' | 'descending';
      cursor?: EventId;
    };
    handler?: (eventData: any) => Promise<any>;
    client?: SuiClient;
  }
): Promise<{
  eventDatas: SuiEvent[];
  nextCursor: EventId | null | undefined;
  hasNextPage: boolean;
}> {
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

    const { data: eventDatas, hasNextPage, nextCursor } = response;

    // Process events
    if (options?.handler) {
      await options.handler(eventDatas);
    }
    return { eventDatas, nextCursor, hasNextPage };
  } catch (error) {
    console.error('Failed to query events:', error);
    throw error;
  }
}
