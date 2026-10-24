export const PASSWORD_MIN_LENGTH=14;
export const PASSWORD_MAX_LENGTH=128;
export const PASSWORD_REQUIREMENT='Use a unique password of 14–128 characters.';
export function validNewPassword(value:unknown):value is string{
  return typeof value==='string'&&value.length>=PASSWORD_MIN_LENGTH&&value.length<=PASSWORD_MAX_LENGTH;
}
