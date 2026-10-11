export interface ConsultLead {
  name: string;
  contact: string;
  company: string;
  city: string;
  mode: 'agent' | 'first' | 'second' | 'unsure';
  capacity: 'unspecified' | 'team' | 'individual' | 'starting';
  message: string;
  requestId: string;
}
export interface ConsultRequest extends ConsultLead { consent: boolean; website: string; }
export interface ConsultResponse { ok: boolean; code: string; message: string; requestId?: string; }
