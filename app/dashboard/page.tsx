import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Bot, Activity, Users } from 'lucide-react';
import { queryOne } from '@/lib/db';

async function getStats() {
  const companies = await queryOne('SELECT COUNT(*) as count FROM companies');
  const bots = await queryOne('SELECT COUNT(*) as count FROM bots');
  const activeTokens = await queryOne("SELECT COUNT(*) as count FROM api_tokens WHERE status = 'active'");
  
  return {
    companies: companies?.count || 0,
    bots: bots?.count || 0,
    activeTokens: activeTokens?.count || 0
  };
}

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Bienvenido al panel de administración de la plataforma.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Empresas Totales</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.companies}</div>
            <p className="text-xs text-muted-foreground">Empresas registradas en la plataforma</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bots Activos</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.bots}</div>
            <p className="text-xs text-muted-foreground">Bots configurados y listos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Activos</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeTokens}</div>
            <p className="text-xs text-muted-foreground">Credenciales de API válidas</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
