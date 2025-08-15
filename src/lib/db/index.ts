import DatabaseConnection from './connection';

export class DatabaseService {
  private static db = DatabaseConnection.getInstance();

  static async query<T extends Record<string, any> = any>(text: string, params?: any[]) {
    return this.db.query<T>(text, params);
  }

  static async transaction<T>(
    callback: (client: any) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(callback);
  }

  static async healthCheck(): Promise<boolean> {
    return this.db.healthCheck();
  }

  static async getConnectionInfo() {
    return this.db.getConnectionInfo();
  }

  static async close() {
    return this.db.close();
  }
}

export { DatabaseConnection };
export default DatabaseService;