'use client';

import { use, useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import Link from 'next/link';
import { ArrowLeft, Save, Trash2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useRouter } from 'next/navigation';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function BotDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: bot, error } = useSWR(`/api/bots/${id}`, fetcher);
  const { data: models } = useSWR('/api/models', fetcher);
  
  const [loading, setLoading] = useState(false);
  const [temperature, setTemperature] = useState([0.7]);

  useEffect(() => {
    if (bot) {
      setTemperature([bot.temperature]);
    }
  }, [bot]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      description: formData.get('description'),
      model: formData.get('model'),
      system_prompt: formData.get('system_prompt'),
      temperature: temperature[0],
      max_tokens: parseInt(formData.get('max_tokens') as string),
      status: formData.get('status'),
    };

    try {
      const res = await fetch(`/api/bots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        mutate(`/api/bots/${id}`);
        alert('Bot actualizado correctamente');
      }
    } catch (error) {
      console.error('Error updating bot:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('¿Estás seguro de eliminar este bot? Esta acción no se puede deshacer.')) return;
    
    try {
      await fetch(`/api/bots/${id}`, { method: 'DELETE' });
      router.push('/dashboard/bots');
    } catch (error) {
      console.error('Error deleting bot:', error);
    }
  }

  if (error) return <div>Error al cargar bot</div>;
  if (!bot) return <div>Cargando...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" className="mb-4 pl-0">
            <Link href="/dashboard/bots">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al listado
            </Link>
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">{bot.name}</h2>
          <p className="text-muted-foreground">Empresa: {bot.company_name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" size="icon" onClick={handleDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button asChild>
            <Link href={`/dashboard/chat?bot=${bot.id}`}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Probar Chat
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Configuración</CardTitle>
            <CardDescription>Modifica los parámetros del bot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" name="name" defaultValue={bot.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Estado</Label>
                <Select name="status" defaultValue={bot.status}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" name="description" defaultValue={bot.description} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Modelo de IA</Label>
              <Select name="model" defaultValue={bot.model}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models?.map((m: any) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="system_prompt">Prompt del Sistema</Label>
              <Textarea 
                id="system_prompt" 
                name="system_prompt" 
                className="min-h-[150px] font-mono text-sm"
                defaultValue={bot.system_prompt}
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <div className="flex justify-between">
                  <Label>Temperatura ({temperature[0]})</Label>
                </div>
                <Slider 
                  value={temperature} 
                  onValueChange={setTemperature} 
                  max={1} 
                  step={0.1} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_tokens">Max Tokens</Label>
                <Input 
                  id="max_tokens" 
                  name="max_tokens" 
                  type="number" 
                  defaultValue={bot.max_tokens} 
                  min={100} 
                  max={4096} 
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button type="submit" disabled={loading}>
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
