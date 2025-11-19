'use client';

import { use, useState } from 'react';
import useSWR, { mutate } from 'swr';
import Link from 'next/link';
import { ArrowLeft, Copy, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function CompanyDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: company, error: companyError } = useSWR(`/api/companies/${id}`, fetcher);
  const { data: tokens, error: tokensError } = useSWR(`/api/companies/${id}/tokens`, fetcher);
  
  const [newTokenName, setNewTokenName] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  async function handleCreateToken() {
    try {
      const res = await fetch(`/api/companies/${id}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTokenName }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setCreatedToken(data.token);
        mutate(`/api/companies/${id}/tokens`);
        setNewTokenName('');
      }
    } catch (error) {
      console.error('Error creating token:', error);
    }
  }

  async function handleRevokeToken(tokenId: number) {
    if (!confirm('¿Estás seguro de que quieres revocar este token?')) return;
    
    try {
      await fetch(`/api/tokens/${tokenId}`, { method: 'DELETE' });
      mutate(`/api/companies/${id}/tokens`);
    } catch (error) {
      console.error('Error revoking token:', error);
    }
  }

  if (companyError || tokensError) return <div>Error al cargar datos</div>;
  if (!company) return <div>Cargando...</div>;

  return (
    <div className="space-y-8">
      <div>
        <Button asChild variant="ghost" className="mb-4 pl-0">
          <Link href="/dashboard/companies">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al listado
          </Link>
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{company.name}</h2>
            <p className="text-muted-foreground">{company.email}</p>
          </div>
          <Badge variant={company.status === 'active' ? 'default' : 'secondary'} className="text-lg px-4 py-1">
            {company.status}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Tokens de API</CardTitle>
            <CardDescription>Gestiona las llaves de acceso para esta empresa.</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setCreatedToken(null);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Generar Token
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generar Nuevo Token</DialogTitle>
              </DialogHeader>
              
              {!createdToken ? (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nombre del Token</Label>
                    <Input 
                      placeholder="Ej. Servidor de Producción" 
                      value={newTokenName}
                      onChange={(e) => setNewTokenName(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreateToken} disabled={!newTokenName}>Generar</Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  <div className="p-4 bg-muted rounded-md break-all font-mono text-sm">
                    {createdToken}
                  </div>
                  <p className="text-sm text-destructive">
                    ¡Copia este token ahora! No podrás verlo de nuevo.
                  </p>
                  <DialogFooter>
                    <Button onClick={() => setIsDialogOpen(false)}>Cerrar</Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead>Último Uso</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens?.map((token: any) => (
                <TableRow key={token.id}>
                  <TableCell className="font-medium">{token.name}</TableCell>
                  <TableCell>
                    <Badge variant={token.status === 'active' ? 'outline' : 'destructive'}>
                      {token.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(token.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {token.last_used_at ? new Date(token.last_used_at).toLocaleString() : 'Nunca'}
                  </TableCell>
                  <TableCell className="text-right">
                    {token.status === 'active' && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRevokeToken(token.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {tokens?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No hay tokens generados para esta empresa.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
