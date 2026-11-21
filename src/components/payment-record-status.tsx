import {paymentPresentation} from '@/lib/payment-presentation';
export function PaymentRecordStatus({record,compact=false}:{record:Parameters<typeof paymentPresentation>[0];compact?:boolean}){
  const state=paymentPresentation(record);
  return <><span className={`badge badge-${state.color}`} title={compact&&state.detail?state.detail:undefined} aria-label={compact&&state.detail?`${state.label}. ${state.detail}`:undefined}>{state.label}</span>{state.detail&&!compact&&<p className="muted small">{state.detail}</p>}</>;
}
