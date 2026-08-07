import MainLayout from '@/components/layout/MainLayout';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isAdminApiConfigured } from '@/lib/api/adminClient';
import { ShieldCheck } from 'lucide-react';
import { DiagnosticsTab } from './DiagnosticsTab';
import { EncryptionKeyCard } from './EncryptionKeyCard';
import { ExchangesTab } from './ExchangesTab';
import { ServicesTab } from './ServicesTab';
import { UpdatesTab } from './UpdatesTab';

function AdminPage() {
  const configured = isAdminApiConfigured();

  return (
    <MainLayout pageTitle="Admin" activePage="/admin">
      <div className="p-lg max-w-5xl mx-auto space-y-lg">
        <header className="flex items-start gap-md">
          <div className="rounded-lg bg-inner-container p-sm">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-2xl font-semibold leading-tight">
              Self-hosted admin
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage compose services, exchange connectivity, and image
              versions for this deployment.
            </p>
          </div>
        </header>

        {!configured ? (
          <Card compact className="p-md text-sm">
            <strong>Admin API not configured.</strong> Set{' '}
            <code className="px-1 rounded bg-inner-container">
              VITE_ADMIN_API_URL
            </code>{' '}
            in the frontend service env (see docker-sh) to point at the
            admin-sh service.
          </Card>
        ) : (
          <>
            {/* Above the tabs, not inside one: it is a one-time setup
                recommendation rather than a section, and it removes itself
                for good once the key is set. */}
            <EncryptionKeyCard />
            <Tabs defaultValue="services" paramKey="tab" paramSync>
              <TabsList>
                <TabsTrigger value="services">Services</TabsTrigger>
                <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
                <TabsTrigger value="exchanges">Exchanges</TabsTrigger>
                <TabsTrigger value="updates">Updates</TabsTrigger>
              </TabsList>
              <TabsContent value="services" className="">
                <ServicesTab />
              </TabsContent>
              <TabsContent value="diagnostics" className="">
                <DiagnosticsTab />
              </TabsContent>
              <TabsContent value="exchanges" className="">
                <ExchangesTab />
              </TabsContent>
              <TabsContent value="updates" className="">
                <UpdatesTab />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </MainLayout>
  );
}

export default AdminPage;
