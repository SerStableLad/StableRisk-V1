import { EventRepository } from '../db/repositories/event-repository';

export function withDatabaseLogging<T extends (...args: any[]) => any>(
  fn: T,
  eventConfig: {
    aggregateType: string;
    eventType: string;
    getAggregateId: (...args: Parameters<T>) => string;
    getMetadata?: (...args: Parameters<T>) => Record<string, any>;
  }
): T {
  return ((...args: Parameters<T>) => {
    const result = fn(...args);
    
    // For async functions
    if (result && typeof result.then === 'function') {
      return result.then((value: any) => {
        // Log success
        // Log success (non-blocking)
        const eventRepo = new EventRepository();
        eventRepo.logEvent(
          eventConfig.getAggregateId(...args),
          eventConfig.aggregateType,
          eventConfig.eventType,
          {
            success: true,
            result: typeof value === 'object' ? Object.keys(value) : value,
            ...(eventConfig.getMetadata ? eventConfig.getMetadata(...args) : {})
          }
        ).catch(logError => {
          console.error('Failed to log database event:', logError);
        });
        return value;
      }).catch((error: any) => {
        // Log error
        // Log error (non-blocking)
        const eventRepo = new EventRepository();
        eventRepo.logEvent(
          eventConfig.getAggregateId(...args),
          eventConfig.aggregateType,
          eventConfig.eventType,
          {
            success: false,
            error: error.message,
            ...(eventConfig.getMetadata ? eventConfig.getMetadata(...args) : {})
          }
        ).catch(logError => {
          console.error('Failed to log database event:', logError);
        });
        throw error;
      });
    }
    
    // For sync functions
    // Log success (non-blocking)
    const eventRepo = new EventRepository();
    eventRepo.logEvent(
      eventConfig.getAggregateId(...args),
      eventConfig.aggregateType,
      eventConfig.eventType,
      {
        success: true,
        result: typeof result === 'object' ? Object.keys(result) : result,
        ...(eventConfig.getMetadata ? eventConfig.getMetadata(...args) : {})
      }
    ).catch(logError => {
      console.error('Failed to log database event:', logError);
    });
    
    return result;
  }) as T;
}