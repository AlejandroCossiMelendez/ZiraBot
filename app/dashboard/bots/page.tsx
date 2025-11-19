'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { Plus, Search, Bot, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function BotsPage() {
  const { data: bots, error, isLoading } = useSWR('/api/bots', fetcher);

  if (error) return <div>Error al cargar bots</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Bots</h2>
          <p className="text-muted-foreground">Gestiona los asistentes virtuales y sus configuraciones.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/bots/new">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Bot
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <p>Cargando bots...</p>
        ) : bots?.map((bot: any) => (
          <Card key={bot.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">{bot.name}</CardTitle>
                </div>
                <Badge variant={bot.status === 'active' ? 'default' : 'secondary'}>
                  {bot.status}
                </Badge>
              </div>
              <CardDescription className="line-clamp-2 h-10">
                {bot.description || 'Sin descripción'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Modelo:</span>
                  <span className="font-mono">{bot.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Empresa:</span>
                  <span>{bot.company_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Temp:</span>
                  <span>{bot.temperature}</span>
                </div>
              </div>
              
              <div className="mt-auto pt-4 flex gap-2">
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/dashboard/bots/${bot.id}`}>
                    <Settings2 className="w-4 h-4 mr-2" />
                    Configurar
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {bots?.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No hay bots creados. ¡Crea el primero!
          </div>
        )}
      </div>
    </div>
  );
}
