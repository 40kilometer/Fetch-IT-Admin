import {paymentPresentation} from '@/lib/payment-presentation';
export function PaymentRecordStatus({record}:{record:Parameters<typeof paymentPresentation>[0]}){
  const state=paymentPresentation(record);
  return <><span className={`badge badge-${state.color}`}>{state.label}</span>{state.detail&&<p className="muted small">{state.detail}</p>}</>;
}
