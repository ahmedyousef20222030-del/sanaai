'use client'

import { useState } from 'react'

export default function InvoicePDF({ invoice, onClose }: { invoice: any; onClose: () => void }) {
  const [copies, setCopies] = useState(1)

  const fmt = (n: number) => Number(n || 0).toLocaleString('ar-EG') + ' ج.م'
  const total = invoice.amount || 0
  const deposit = invoice.orders?.deposit_amount || 0
  const remaining = total - deposit

  function handlePrint() {
    window.print()
  }

  const invoiceContent = (
    <div style={{
      padding: '32px',
      fontFamily: "Tahoma, Arial, sans-serif",
      direction: 'rtl',
      color: '#1a1a1a',
      background: '#fff',
    }}>
      {/* الهيدر */}
      <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '3px solid #D4A843', paddingBottom: '16px' }}>
        <div style={{ fontSize: '28px', fontWeight: 900, color: '#D4A843', marginBottom: '4px' }}>صَنَاعي</div>
        <div style={{ fontSize: '14px', color: '#666' }}>{invoice.tenant_name || 'اسم المصنع'}</div>
        <div style={{ fontSize: '13px', color: '#999', marginTop: '8px' }}>
          فاتورة رقم: <strong>{invoice.invoice_number || invoice.orders?.order_number}</strong>
        </div>
      </div>

      {/* بيانات العميل */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '13px' }}>
        <div>
          <p style={{ marginBottom: '4px' }}><strong>العميل:</strong> {invoice.orders?.clients?.name || '-'}</p>
          <p><strong>الهاتف:</strong> {invoice.orders?.clients?.phone || '-'}</p>
        </div>
        <div style={{ textAlign: 'left' }}>
          <p style={{ marginBottom: '4px' }}>
            <strong>تاريخ الإصدار:</strong> {invoice.created_at ? new Date(invoice.created_at).toLocaleDateString('ar-EG') : '-'}
          </p>
          <p>
            <strong>تاريخ الاستحقاق:</strong> {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('ar-EG') : '-'}
          </p>
        </div>
      </div>

      {/* جدول الأصناف */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '20px' }}>
        <thead>
          <tr style={{ background: '#f5f0e0' }}>
            <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>الوصف</th>
            <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', width: '80px' }}>الكمية</th>
            <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', width: '100px' }}>سعر الوحدة</th>
            <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', width: '100px' }}>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #ddd', padding: '10px' }}>
              طلب رقم {invoice.orders?.order_number} — {invoice.orders?.clients?.name}
            </td>
            <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>
              {invoice.orders?.quantity || '-'}
            </td>
            <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>
              {fmt(invoice.orders?.unit_price)}
            </td>
            <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>
              {fmt(total)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* الإجمالي */}
      <div style={{ marginRight: 'auto', width: '260px', fontSize: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
          <span>الإجمالي:</span>
          <strong>{fmt(total)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: '#27ae60' }}>
          <span>العربون المدفوع:</span>
          <strong>{fmt(deposit)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #D4A843', fontSize: '16px', marginTop: '4px' }}>
          <span>المتبقي:</span>
          <strong style={{ color: '#D4A843' }}>{fmt(remaining)}</strong>
        </div>
      </div>

      {/* الحالة */}
      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <span style={{
          display: 'inline-block', padding: '6px 20px', borderRadius: '20px',
          fontSize: '13px', fontWeight: 700,
          background: invoice.status === 'مدفوعة' ? '#d4f4dd' : '#fef3d4',
          color: invoice.status === 'مدفوعة' ? '#27ae60' : '#D4A843',
        }}>
          {invoice.status || 'مسودة'}
        </span>
      </div>

      {/* الفوتر */}
      <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '11px', color: '#999', borderTop: '1px solid #eee', paddingTop: '12px' }}>
        شكراً لتعاملكم معنا — صَنَاعي · نظام إدارة المصانع
      </div>
    </div>
  )

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-print-area, #invoice-print-area * { visibility: visible; }
          #invoice-print-area {
            position: absolute;
            top: 0; left: 0; width: 100%;
          }
          .invoice-copy { page-break-after: always; }
          .invoice-copy:last-child { page-break-after: avoid; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 no-print-overlay" onClick={onClose}>
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

          {/* محتوى الفاتورة - معاينة على الشاشة */}
          <div id="invoice-print-area">
            {Array.from({ length: copies }).map((_, i) => (
              <div key={i} className="invoice-copy">
                {invoiceContent}
              </div>
            ))}
          </div>

          {/* أزرار التحكم - متخفية عند الطباعة */}
          <div className="p-4 border-t flex items-center justify-between gap-3 bg-gray-50 rounded-b-2xl no-print">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700 font-bold">عدد النسخ:</label>
              <input type="number" min={1} max={10} value={copies}
                onChange={e => setCopies(Math.max(1, Number(e.target.value)))}
                className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-center text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-100">
                إغلاق
              </button>
              <button onClick={handlePrint}
                className="px-5 py-2 bg-amber-500 text-black rounded-lg text-sm font-bold hover:bg-amber-400">
                🖨️ طباعة / حفظ PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}