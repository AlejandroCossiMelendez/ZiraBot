'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function NewBotPage() {
  const router = useRouter();
  const { data: companies } = useSWR('/api/companies', fetcher);
  const { data: models } = useSWR('/api/models', fetcher);
  
  const [loading, setLoading] = useState(false);
  const [temperature, setTemperature] = useState([0.7]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      description: formData.get('description'),
      company_id: formData.get('company_id'),
      model: formData.get('model'),
      system_prompt: formData.get('system_prompt'),
      temperature: temperature[0],
      max_tokens: parseInt(formData.get('max_tokens') as string),
    };

    try {
      const res = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        router.push('/dashboard/bots');
      }
    } catch (error) {
      console.error('Error creating bot:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <Button asChild variant="ghost" className="mb-4 pl-0">
          <Link href="/dashboard/bots">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al listado
          </Link>
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">Nuevo Bot</h2>
        <p className="text-muted-foreground">Configura un nuevo asistente virtual.</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Configuración del Bot</CardTitle>
            <CardDescription>Define el comportamiento y modelo del bot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre del Bot</Label>
                <Input id="name" name="name" required placeholder="Ej. Asistente de Soporte" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_id">Empresa Asignada</Label>
                <Select name="company_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" name="description" placeholder="Breve descripción del propósito del bot" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Modelo de IA</Label>
              <Select name="model" required defaultValue="llama3.2:1b">
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar modelo" />
                </SelectTrigger>
                <SelectContent>
                  {models?.map((m: any) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.name} ({(m.size / 1024 / 1024 / 1024).toFixed(1)} GB)
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
                placeholder="Eres un asistente útil y profesional..."
                required
              />
              <p className="text-xs text-muted-foreground">
                Define la personalidad y las instrucciones base del bot.
              </p>
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
                <p className="text-xs text-muted-foreground">
                  Valores más altos hacen al bot más creativo, más bajos más preciso.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_tokens">Max Tokens</Label>
                <Input 
                  id="max_tokens" 
                  name="max_tokens" 
                  type="number" 
                  defaultValue={2000} 
                  min={100} 
                  max={4096} 
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/dashboard/bots">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creando...' : 'Crear Bot'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
