export class NginxHealthMonitor {
  static async checkProxyHealth(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost/nginx-health');
      return response.ok;
    } catch (error) {
      console.error('NGINX health check failed:', error);
      return false;
    }
  }
  
  static async getProxyStatus(): Promise<any> {
    try {
      const response = await fetch('http://localhost/nginx-status');
      const status = await response.text();
      return this.parseNginxStatus(status);
    } catch (error) {
      console.error('NGINX status check failed:', error);
      return null;
    }
  }
  
  private static parseNginxStatus(status: string): any {
    // Parse nginx stub_status format
    const lines = status.split('\n');
    return {
      active_connections: parseInt(lines[0]?.split(' ')[2] || '0'),
      server_accepts: parseInt(lines[2]?.split(' ')[1] || '0'),
      server_handled: parseInt(lines[2]?.split(' ')[2] || '0'),
      server_requests: parseInt(lines[2]?.split(' ')[3] || '0'),
    };
  }
}