export const STATUSES = ['on_time','check_in','boarding','last_call','gate_closed','departed'] as const
export type FlightStatus = typeof STATUSES[number]
export type Room = { id:string; code:string; destination:string; subtitle:string|null; icon_key:string|null; enabled:boolean }
export type Teacher = { id:string; name:string; enabled:boolean }
export type Schedule = { id:string; class_code:string; teacher_id:string; room_id:string; weekday:number; start_time:string; end_time:string; active_from:string; active_until:string|null; enabled:boolean; manual_status:FlightStatus|null; manual_status_date:string|null }
export type Settings = { id:string; display_lead_minutes:number; checkin_minutes_before:number; boarding_minutes_before:number; last_call_minutes_before:number; gate_closed_minutes_after_start:number; retain_after_end_minutes:number; page_rotation_seconds:number }
export const STATUS_LABELS:Record<FlightStatus,string>={on_time:'NO HORÁRIO · ON TIME',check_in:'CHECK-IN',boarding:'EMBARQUE · BOARDING',last_call:'ÚLTIMA CHAMADA · LAST CALL',gate_closed:'PORTÃO FECHADO · GATE CLOSED',departed:'DECOLADO · DEPARTED'}
