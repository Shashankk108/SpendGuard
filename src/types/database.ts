export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          p_card_name: string | null;
          department: string | null;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          p_card_name?: string | null;
          department?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          p_card_name?: string | null;
          department?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      approvers: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          email: string;
          title: string;
          min_amount: number;
          max_amount: number | null;
          approval_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          email: string;
          title: string;
          min_amount?: number;
          max_amount?: number | null;
          approval_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          email?: string;
          title?: string;
          min_amount?: number;
          max_amount?: number | null;
          approval_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
      };
      purchase_requests: {
        Row: {
          id: string;
          requester_id: string;
          cardholder_name: string;
          p_card_name: string;
          expense_date: string;
          vendor_name: string;
          vendor_location: string | null;
          purchase_amount: number;
          currency: string;
          tax_amount: number;
          shipping_amount: number;
          total_amount: number;
          business_purpose: string;
          detailed_description: string;
          po_bypass_reason: string | null;
          po_bypass_explanation: string | null;
          category: string;
          is_software_subscription: boolean;
          it_license_confirmed: boolean;
          is_preferred_vendor: boolean;
          status: string;
          employee_signature_url: string | null;
          employee_signed_at: string | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          cardholder_name: string;
          p_card_name: string;
          expense_date: string;
          vendor_name: string;
          vendor_location?: string | null;
          purchase_amount: number;
          currency?: string;
          tax_amount?: number;
          shipping_amount?: number;
          total_amount: number;
          business_purpose: string;
          detailed_description: string;
          po_bypass_reason?: string | null;
          po_bypass_explanation?: string | null;
          category: string;
          is_software_subscription?: boolean;
          it_license_confirmed?: boolean;
          is_preferred_vendor?: boolean;
          status?: string;
          employee_signature_url?: string | null;
          employee_signed_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          cardholder_name?: string;
          p_card_name?: string;
          expense_date?: string;
          vendor_name?: string;
          vendor_location?: string | null;
          purchase_amount?: number;
          currency?: string;
          tax_amount?: number;
          shipping_amount?: number;
          total_amount?: number;
          business_purpose?: string;
          detailed_description?: string;
          po_bypass_reason?: string | null;
          po_bypass_explanation?: string | null;
          category?: string;
          is_software_subscription?: boolean;
          it_license_confirmed?: boolean;
          is_preferred_vendor?: boolean;
          status?: string;
          employee_signature_url?: string | null;
          employee_signed_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      approval_signatures: {
        Row: {
          id: string;
          request_id: string;
          approver_id: string | null;
          approver_name: string;
          approver_title: string;
          signature_url: string | null;
          action: string;
          comments: string | null;
          signed_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          approver_id?: string | null;
          approver_name: string;
          approver_title: string;
          signature_url?: string | null;
          action: string;
          comments?: string | null;
          signed_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          approver_id?: string | null;
          approver_name?: string;
          approver_title?: string;
          signature_url?: string | null;
          action?: string;
          comments?: string | null;
          signed_at?: string;
        };
      };
      supporting_documents: {
        Row: {
          id: string;
          request_id: string;
          file_name: string;
          file_url: string;
          file_type: string | null;
          file_size: number | null;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          file_name: string;
          file_url: string;
          file_type?: string | null;
          file_size?: number | null;
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          file_name?: string;
          file_url?: string;
          file_type?: string | null;
          file_size?: number | null;
          uploaded_at?: string;
        };
      };
      prohibited_categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          user_email: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
          changes: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          user_email?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          changes?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          user_email?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          changes?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
      email_notifications: {
        Row: {
          id: string;
          recipient_email: string;
          recipient_name: string | null;
          subject: string;
          body_text: string;
          body_html: string | null;
          related_entity_type: string | null;
          related_entity_id: string | null;
          status: string;
          created_at: string;
          sent_at: string | null;
        };
        Insert: {
          id?: string;
          recipient_email: string;
          recipient_name?: string | null;
          subject: string;
          body_text: string;
          body_html?: string | null;
          related_entity_type?: string | null;
          related_entity_id?: string | null;
          status?: string;
          created_at?: string;
          sent_at?: string | null;
        };
        Update: {
          id?: string;
          recipient_email?: string;
          recipient_name?: string | null;
          subject?: string;
          body_text?: string;
          body_html?: string | null;
          related_entity_type?: string | null;
          related_entity_id?: string | null;
          status?: string;
          created_at?: string;
          sent_at?: string | null;
        };
      };
    };
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Approver = Database['public']['Tables']['approvers']['Row'];
export type PurchaseRequest = Database['public']['Tables']['purchase_requests']['Row'];
export type ApprovalSignature = Database['public']['Tables']['approval_signatures']['Row'];
export type SupportingDocument = Database['public']['Tables']['supporting_documents']['Row'];
export type ProhibitedCategory = Database['public']['Tables']['prohibited_categories']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
export type EmailNotification = Database['public']['Tables']['email_notifications']['Row'];

export interface Budget {
  id: string;
  department: string;
  fiscal_year: number;
  fiscal_quarter: number | null;
  allocated_amount: number;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type RequestStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type POBypassReason = 'vendor_limitations' | 'time_sensitivity' | 'other';
export type UserRole = 'employee' | 'approver' | 'admin';
