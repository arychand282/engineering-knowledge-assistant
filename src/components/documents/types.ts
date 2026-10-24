export interface DocumentRowView {
  id: string;
  title: string;
  documentNumber: string;
  documentType: string;
  revision: string;
  status: string;
  createdAt: string;
  approvedByEmail: string | null;
  approvedAt: string | null;
}
