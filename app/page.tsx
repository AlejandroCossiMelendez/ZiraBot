import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Bot, Key, MessageSquare } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4 text-balance">
            Plataforma de Bots con IA
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
            Crea empresas, genera tokens de API y personaliza bots con modelos de Ollama
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Card>
            <CardHeader>
              <Building2 className="w-10 h-10 mb-2 text-primary" />
              <CardTitle>Gestión de Empresas</CardTitle>
              <CardDescription>
                Crea y administra múltiples empresas con acceso independiente
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Key className="w-10 h-10 mb-2 text-primary" />
              <CardTitle>Tokens de API</CardTitle>
              <CardDescription>
                Genera tokens seguros para acceder a tus bots mediante API
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Bot className="w-10 h-10 mb-2 text-primary" />
              <CardTitle>Bots Personalizados</CardTitle>
              <CardDescription>
                Configura bots con diferentes modelos y personalidades
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <MessageSquare className="w-10 h-10 mb-2 text-primary" />
              <CardTitle>Chat en Tiempo Real</CardTitle>
              <CardDescription>
                Interactúa con tus bots usando Ollama en tu servidor
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="flex justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/dashboard">
              Ir al Dashboard
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/api-docs">
              Documentación API
            </Link>
          </Button>
        </div>

        <Card className="mt-16 bg-muted/50">
          <CardHeader>
            <CardTitle>Modelos Disponibles</CardTitle>
            <CardDescription>
              Tus modelos de Ollama instalados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 bg-background rounded-lg">
                <Bot className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-semibold">deepseek-coder-v2:latest</p>
                  <p className="text-sm text-muted-foreground">8.9 GB - Especializado en código</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-background rounded-lg">
                <Bot className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-semibold">llama3.2:1b</p>
                  <p className="text-sm text-muted-foreground">1.3 GB - Propósito general</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
