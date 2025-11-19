'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewCompanyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
    };

    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Error creating company');
      }

      router.push('/dashboard/companies');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <Button asChild variant="ghost" className="mb-4 pl-0">
          <Link href="/dashboard/companies">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al listado
          </Link>
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">Nueva Empresa</h2>
        <p className="text-muted-foreground">Registra una nueva empresa para darle acceso a la plataforma.</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Detalles de la Empresa</CardTitle>
            <CardDescription>Ingresa la información básica de la empresa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre de la Empresa</Label>
              <Input id="name" name="name" required placeholder="Ej. Tech Solutions Inc." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email de Contacto</Label>
              <Input id="email" name="email" type="email" required placeholder="contacto@empresa.com" />
            </div>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/dashboard/companies">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creando...' : 'Crear Empresa'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
