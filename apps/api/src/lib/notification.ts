import { config } from '../config.js';

export interface NotificationMessage {
  title: string;
  body: string;
  severity?: 'info' | 'warning' | 'critical';
  link?: string;
  fields?: Record<string, string>;
}

export interface NotificationResult {
  success: boolean;
  channel: string;
  error?: string;
}

export class NotificationService {
  private slackWebhook: string | undefined;
  private pagerDutyRoutingKey: string | undefined;
  private pagerDutyApiUrl: string;

  constructor() {
    this.slackWebhook = config.SLACK_WEBHOOK_URL;
    this.pagerDutyRoutingKey = config.PAGERDUTY_ROUTING_KEY;
    this.pagerDutyApiUrl = 'https://events.pagerduty.com/v2/enqueue';
  }

  get slackEnabled(): boolean {
    return !!this.slackWebhook;
  }

  get pagerDutyEnabled(): boolean {
    return !!this.pagerDutyRoutingKey;
  }

  async sendAll(message: NotificationMessage): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    if (this.slackEnabled) {
      results.push(await this.sendSlack(message));
    }
    if (this.pagerDutyEnabled && (message.severity === 'critical' || message.severity === 'warning')) {
      results.push(await this.sendPagerDuty(message));
    }
    return results;
  }

  async sendSlack(message: NotificationMessage): Promise<NotificationResult> {
    if (!this.slackWebhook) {
      return { success: false, channel: 'slack', error: 'not_configured' };
    }

    const color = message.severity === 'critical' ? '#ef4444'
      : message.severity === 'warning' ? '#f59e0b'
      : '#3b82f6';

    const fields = message.fields
      ? Object.entries(message.fields).map(([k, v]) => ({
          type: 'mrkdwn',
          text: `*${k}:*\n${v}`,
        }))
      : [];

    const payload = {
      text: message.title,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*${message.title}*` },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: message.body },
        },
        ...(fields.length > 0 ? [{ type: 'section', fields }] : []),
        ...(message.link
          ? [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `<${message.link}|点击查看详情>` },
              },
            ]
          : []),
      ],
      attachments: [{ color, blocks: [] }],
    };

    try {
      const res = await fetch(this.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        return { success: false, channel: 'slack', error: `HTTP ${res.status}` };
      }

      return { success: true, channel: 'slack' };
    } catch (err) {
      return {
        success: false,
        channel: 'slack',
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  async sendPagerDuty(message: NotificationMessage): Promise<NotificationResult> {
    if (!this.pagerDutyRoutingKey) {
      return { success: false, channel: 'pagerduty', error: 'not_configured' };
    }

    const eventAction = message.severity === 'critical' ? 'trigger' : 'trigger';
    const severity = message.severity === 'critical' ? 'critical' : 'warning';

    const payload = {
      routing_key: this.pagerDutyRoutingKey,
      event_action: eventAction,
      dedup_key: message.title,
      payload: {
        summary: message.title,
        timestamp: new Date().toISOString(),
        severity,
        source: 'secops-platform',
        custom_details: message.fields || {},
      },
      ...(message.link ? { links: [{ href: message.link, text: '详情' }] } : {}),
    };

    try {
      const res = await fetch(this.pagerDutyApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        return { success: false, channel: 'pagerduty', error: `HTTP ${res.status}` };
      }

      return { success: true, channel: 'pagerduty' };
    } catch (err) {
      return {
        success: false,
        channel: 'pagerduty',
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }
}

export const notificationService = new NotificationService();
