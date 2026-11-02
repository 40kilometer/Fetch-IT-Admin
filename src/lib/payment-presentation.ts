import {PAYMENT_STATUS_LABEL} from './payment-policy';

type PaymentRecord={status:string;paymentMethod:string;paymentStatus:string;customerPaidAmount:unknown;riderReceivedAmount:unknown};
export function paymentPresentation(record:PaymentRecord){
  if(record.paymentMethod==='CASH'&&record.paymentStatus==='UNPAID'&&record.status==='DELIVERED'){
    return {label:'Cash not confirmed',color:'amber',detail:'Service completed. Cash collection has not been confirmed in the payment record.'};
  }
  if(record.paymentMethod==='CASH'&&record.paymentStatus==='UNPAID'&&record.status==='CANCELLED'&&record.customerPaidAmount==null&&record.riderReceivedAmount==null){
    return {label:'No payment recorded',color:'blue',detail:'Booking cancelled. No cash confirmation is recorded.'};
  }
  return {label:PAYMENT_STATUS_LABEL[record.paymentStatus as keyof typeof PAYMENT_STATUS_LABEL]??record.paymentStatus.toLowerCase().replaceAll('_',' '),color:record.paymentStatus==='PAID'?'green':record.paymentStatus==='FAILED'?'red':['PENDING','UNPAID'].includes(record.paymentStatus)?'amber':'blue',detail:''};
}
