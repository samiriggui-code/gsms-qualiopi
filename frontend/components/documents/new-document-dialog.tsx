'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCreateDocument, useQuoteClients } from '@/lib/gsms/documents';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Refusal } from '@/components/gsms/refusal';

// Nouveau devis : un client (sa fiche donne le code de numérotation et l'adresse), un titre facultatif.
export function NewDocumentDialog({
  open,
  onOpenChange,
  clientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
}) {
  const router = useRouter();
  const clients = useQuoteClients(open);
  const create = useCreateDocument();
  const [client, setClient] = useState(clientId ?? '');
  const [title, setTitle] = useState('');
  const chosen = clients.data?.find((c) => c.id === client);

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      create.reset();
      setTitle('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau devis</DialogTitle>
          <DialogDescription>
            Le devis est numéroté avec le code du client : chaque client a sa
            propre suite (DEV-CODE-001, DEV-CODE-002…).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc-client">Client</Label>
            <Select value={client} onValueChange={setClient}>
              <SelectTrigger id="doc-client">
                <SelectValue
                  placeholder={
                    clients.isLoading ? 'Chargement…' : 'Choisir une entreprise'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(clients.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nom}
                    {c.code ? ` · ${c.code}` : ' · sans code'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {clients.data?.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Aucune entreprise enregistrée.{' '}
                <Link
                  href="/commercial/entreprises"
                  className="text-primary hover:underline"
                >
                  Ajouter une entreprise
                </Link>
              </p>
            )}
          </div>
          {chosen && !chosen.code && (
            <Alert variant="warning" appearance="light">
              <div>
                <AlertTitle>Code client manquant</AlertTitle>
                <AlertDescription>
                  Donnez un code à {chosen.nom} dans sa fiche entreprise avant
                  de créer son devis.{' '}
                  <Link
                    href="/commercial/entreprises"
                    className="font-medium underline"
                  >
                    Ouvrir les entreprises
                  </Link>
                </AlertDescription>
              </div>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Titre (facultatif)</Label>
            <Input
              id="doc-title"
              value={title}
              maxLength={250}
              placeholder="Devis pour …"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {create.error && <Refusal error={create.error} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Annuler
          </Button>
          <Button
            disabled={!client || create.isPending}
            onClick={() =>
              create.mutate(
                { client_id: client, titre: title || undefined },
                {
                  onSuccess: (doc) => {
                    close(false);
                    router.push(`/documents/liste?id=${doc.id}`);
                  },
                },
              )
            }
          >
            Créer le devis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
