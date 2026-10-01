import type { AlertType } from '@paperlab/shared';

export interface Alert {
  id: string;
  timestamp: string;
  type: AlertType;
  severity: 'info' | 'warn' | 'critical';
  message: string;
  payload?: Record<string, unknown>;
  read: boolean;
}

export class AlertService {
  private alerts: Alert[] = [];

  push(
    type: AlertType,
    message: string,
    severity: Alert['severity'] = 'info',
    payload?: Record<string, unknown>,
  ): Alert {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      type,
      severity,
      message,
      payload,
      read: false,
    };
    this.alerts.unshift(alert);
    if (this.alerts.length > 500) this.alerts.length = 500;
    return alert;
  }

  list(limit = 100): Alert[] {
    return this.alerts.slice(0, limit);
  }

  markRead(id: string): void {
    const a = this.alerts.find((x) => x.id === id);
    if (a) a.read = true;
  }
}
