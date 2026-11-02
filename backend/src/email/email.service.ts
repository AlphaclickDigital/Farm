import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EmailParams {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private resendApiKey: string;
  private fromEmail: string;

  constructor(private configService: ConfigService) {
    this.resendApiKey = this.configService.get<string>('RESEND_API_KEY') || '';
    this.fromEmail =
      this.configService.get<string>('FROM_EMAIL') || 'noreply@farmmarketplace.com';
  }

  async sendEmail(params: EmailParams) {
    if (!this.resendApiKey) {
      console.log('[Email] Not configured. Would send:', {
        to: params.to,
        subject: params.subject,
      });
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.resendApiKey}`,
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: params.to,
          subject: params.subject,
          html: params.html,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Email] Send failed:', errorData);
        throw new Error(`Email send failed: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[Email] Sent successfully to:', params.to);
      return { success: true, data };
    } catch (error) {
      console.error('[Email] Failed to send email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendOrderConfirmation(orderData: {
    customerEmail: string;
    customerName: string;
    orderId: string;
    totalAmountCents: number;
    items: any[];
  }) {
    const totalFormatted = `$${(orderData.totalAmountCents / 100).toFixed(2)}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #22c55e; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .order-details { background: white; padding: 15px; margin: 20px 0; border-radius: 8px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Order Confirmation</h1>
            </div>
            <div class="content">
              <p>Hi ${orderData.customerName},</p>
              <p>Thank you for your order! We've received your payment and your order is being processed.</p>

              <div class="order-details">
                <h2>Order #${orderData.orderId.slice(0, 8).toUpperCase()}</h2>
                <p><strong>Total:</strong> ${totalFormatted}</p>
                <p><strong>Items:</strong> ${orderData.items.length}</p>
              </div>

              <p>You can track your order status in your account dashboard.</p>
            </div>
            <div class="footer">
              <p>Farm Marketplace &copy; ${new Date().getFullYear()}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: orderData.customerEmail,
      subject: `Order Confirmation #${orderData.orderId.slice(0, 8).toUpperCase()}`,
      html,
    });
  }

  async sendVendorNewOrder(vendorData: {
    vendorEmail: string;
    vendorName: string;
    vendorOrderId: string;
    subtotalCents: number;
    items: any[];
  }) {
    const subtotalFormatted = `$${(vendorData.subtotalCents / 100).toFixed(2)}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .order-details { background: white; padding: 15px; margin: 20px 0; border-radius: 8px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Order Received!</h1>
            </div>
            <div class="content">
              <p>Hi ${vendorData.vendorName},</p>
              <p>You have a new order to process!</p>

              <div class="order-details">
                <h2>Order #${vendorData.vendorOrderId.slice(0, 8).toUpperCase()}</h2>
                <p><strong>Subtotal:</strong> ${subtotalFormatted}</p>
                <p><strong>Items:</strong> ${vendorData.items.length}</p>
              </div>

              <p>Please log in to your vendor dashboard to view order details and update the status.</p>
            </div>
            <div class="footer">
              <p>Farm Marketplace &copy; ${new Date().getFullYear()}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: vendorData.vendorEmail,
      subject: `New Order #${vendorData.vendorOrderId.slice(0, 8).toUpperCase()}`,
      html,
    });
  }

  async sendVendorApproval(vendorData: {
    email: string;
    name: string;
    storeName: string;
  }) {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #22c55e; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Vendor Approved!</h1>
            </div>
            <div class="content">
              <p>Hi ${vendorData.name},</p>
              <p>Congratulations! Your vendor account "<strong>${vendorData.storeName}</strong>" has been approved.</p>
              <p>You can now start listing products and selling on our marketplace.</p>
              <p>Login to your vendor dashboard to get started!</p>
            </div>
            <div class="footer">
              <p>Farm Marketplace &copy; ${new Date().getFullYear()}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: vendorData.email,
      subject: 'Your Vendor Account Has Been Approved!',
      html,
    });
  }

  async sendVendorRejection(vendorData: {
    email: string;
    name: string;
    storeName: string;
    reason?: string;
  }) {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Vendor Application Update</h1>
            </div>
            <div class="content">
              <p>Hi ${vendorData.name},</p>
              <p>Thank you for your interest in joining our marketplace as a vendor.</p>
              <p>After reviewing your application for "<strong>${vendorData.storeName}</strong>", we are unable to approve it at this time.</p>
              ${vendorData.reason ? `<p><strong>Reason:</strong> ${vendorData.reason}</p>` : ''}
              <p>If you have any questions, please feel free to contact our support team.</p>
            </div>
            <div class="footer">
              <p>Farm Marketplace &copy; ${new Date().getFullYear()}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: vendorData.email,
      subject: 'Vendor Application Update',
      html,
    });
  }

  async sendOrderStatusUpdate(orderData: {
    customerEmail: string;
    customerName: string;
    orderId: string;
    newStatus: string;
    vendorName: string;
  }) {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .order-details { background: white; padding: 15px; margin: 20px 0; border-radius: 8px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Order Status Update</h1>
            </div>
            <div class="content">
              <p>Hi ${orderData.customerName},</p>
              <p>Your order status has been updated.</p>

              <div class="order-details">
                <h2>Order #${orderData.orderId.slice(0, 8).toUpperCase()}</h2>
                <p><strong>Vendor:</strong> ${orderData.vendorName}</p>
                <p><strong>New Status:</strong> ${orderData.newStatus}</p>
              </div>

              <p>You can view the full order details in your account dashboard.</p>
            </div>
            <div class="footer">
              <p>Farm Marketplace &copy; ${new Date().getFullYear()}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: orderData.customerEmail,
      subject: `Order Status Update #${orderData.orderId.slice(0, 8).toUpperCase()}`,
      html,
    });
  }

  async sendPasswordReset(data: { to: string; name: string; resetLink: string }) {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #22c55e; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .button { display: inline-block; background: #22c55e; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Reset Your Password</h1>
            </div>
            <div class="content">
              <p>Hi ${data.name},</p>
              <p>We received a request to reset your password. Click the button below to choose a new one. This link will expire in 1 hour.</p>
              <p><a class="button" href="${data.resetLink}">Reset Password</a></p>
              <p>If you didn't request this, you can safely ignore this email — your password will remain unchanged.</p>
            </div>
            <div class="footer">
              <p>Farm Marketplace &copy; ${new Date().getFullYear()}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: data.to,
      subject: 'Reset Your Password',
      html,
    });
  }
}
