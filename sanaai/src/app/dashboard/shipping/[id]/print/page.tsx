"use client";

import { useEffect } from "react";
import ShippingReceiptPrint from "@/components/ShippingReceiptPrint";
import "@/styles/print-receipt.css";

export default function PrintPage({ params }: { params: { id: string } }) {
  // هنا هتجيب بيانات الشحنة الحقيقية من Supabase حسب params.id
  const order = {
    orderId: "ORD-2707-0001",
    shippingCompany: "أريدكس",
    trackingNumber: "123456789",
    recipientName: "فلسطيني",
    recipientPhone: "01025478954",
    deliveryAddress: "شارع العروبة",
    status: "في الطريق",
  };

  useEffect(() => {
    // نستنى الصفحة تخلص render قبل ما نطبع
    const timer = setTimeout(() => {
      window.print();
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  // اختياري: قفل التاب تلقائيًا بعد الطباعة أو الإلغاء
  useEffect(() => {
    const handleAfterPrint = () => {
      window.close();
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  return <ShippingReceiptPrint {...order} />;
}