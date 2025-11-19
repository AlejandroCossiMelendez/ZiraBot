import Link from 'next/link';
import { LayoutDashboard, Building2, Bot, Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r hidden md:flex flex-col">
        <div className="p-6 border-b">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <Bot className="w-6 h-6 text-primary" />
            <span>BotPlatform</span>
          </Link>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <Button asChild variant="ghost" className="w-full justify-start">
            <Link href="/dashboard">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Resumen
            </Link>
          </Button>
          <Button asChild variant="ghost" className="w-full justify-start">
            <Link href="/dashboard/companies">
              <Building2 className="w-4 h-4 mr-2" />
              Empresas
            </Link>
          </Button>
          <Button asChild variant="ghost" className="w-full justify-start">
            <Link href="/dashboard/bots">
              <Bot className="w-4 h-4 mr-2" />
              Bots & Modelos
            </Link>
          </Button>
          <Button asChild variant="ghost" className="w-full justify-start">
            <Link href="/dashboard/settings">
              <Settings className="w-4 h-4 mr-2" />
              Configuración
            </Link>
          </Button>
        </nav>

        <div className="p-4 border-t">
          <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive">
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
