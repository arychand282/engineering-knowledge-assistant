import { AppShell } from "@/components/auth/app-shell";
import { AuthProvider } from "@/components/auth/auth-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
