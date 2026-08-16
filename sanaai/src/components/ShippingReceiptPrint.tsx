"use client";

interface ShippingReceiptProps {
  orderId: string;
  shippingCompany: string;
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  status: string;
  shippedDate?: string;
  expectedDate?: string;
}

export default function ShippingReceiptPrint({
  orderId,
  shippingCompany,
  trackingNumber,
  recipientName,
  recipientPhone,
  deliveryAddress,
  status,
  shippedDate,
  expectedDate,
}: ShippingReceiptProps) {
  return (
    <div className="receipt-print" dir="rtl">
      <div className="receipt-header">
        <h2>إيصال شحن</h2>
        <span className="order-id">{orderId}</span>
      </div>

      <div className="receipt-row">
        <span className="label">شركة الشحن</span>
        <span className="value">{shippingCompany}</span>
      </div>
      <div className="receipt-row">
        <span className="label">رقم التتبع</span>
        <span className="value">{trackingNumber}</span>
      </div>
      <div className="receipt-row">
        <span className="label">اسم المستلم</span>
        <span className="value">{recipientName}</span>
      </div>
      <div className="receipt-row">
        <span className="label">رقم الهاتف</span>
        <span className="value">{recipientPhone}</span>
      </div>
      <div className="receipt-row address">
        <span className="label">عنوان التسليم</span>
        <span className="value">{deliveryAddress}</span>
      </div>
      {shippedDate && (
        <div className="receipt-row">
          <span className="label">تاريخ الشحن</span>
          <span className="value">{shippedDate}</span>
        </div>
      )}
      {expectedDate && (
        <div className="receipt-row">
          <span className="label">التاريخ المتوقع</span>
          <span className="value">{expectedDate}</span>
        </div>
      )}
      <div className="receipt-row status">
        <span className="label">الحالة</span>
        <span className="value">{status}</span>
      </div>

      <div className="receipt-footer">
        <p>صناعي - إدارة الشحن والتوصيل</p>
      </div>
    </div>
  );
}