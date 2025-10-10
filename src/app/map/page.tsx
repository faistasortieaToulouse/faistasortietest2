'use client';

import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TriangleAlert, PartyPopper } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { DiscordEvents } from '@/components/discord-events';

// Définitions d'interface pour les données d'événement
interface DiscordEvent {
  id: string;
  name: string;
  scheduled_start_time: string;
  channel_id: string | null;
  entity_type: 1 | 2 | 3;
  entity_metadata: {
    location?: string;
  } | null;
}

// Interface pour les événements après géocodage
interface MappedEvent extends DiscordEvent {
  position: { lat: number; lng: number };
  isGeocoded: boolean;
}

const toulousePosition = { lat: 43.6047, lng: 1.4442 };
const GUILD_ID = '1422806103267344416';

// --- Logique de récupération des événements côté serveur ---
async function fetchEventsData(): Promise<DiscordEvent[]> {
  const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!DISCORD_TOKEN) {
    console.warn("DISCORD_BOT_TOKEN est manquant. Les événements ne seront pas chargés sur la carte.");
    return [];
  }

  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/scheduled-events`, {
      headers: { Authorization: `Bot ${DISCORD_TOKEN}` },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      console.error(`Erreur lors de la récupération des événements Discord: ${res.status} ${res.statusText}`);
      return [];
    }

    const events: DiscordEvent[] = await res.json();

    console.log('--- Débogage des lieux des événements Discord (Côté Serveur) ---');
    if (events.length === 0) {
      console.log('Aucun événement récupéré.');
    } else {
      events.forEach(event => {
        const location = event.entity_metadata?.location;
        const type = event.entity_type;
        const locationStatus = location ? location : (type === 3 ? 'NON DÉFINI (EXTERNAL)' : 'N/A (DISCORD)');
        if (type === 3 && location) {
          console.log(`[EXTERNAL - ✅] ${event.name}: "${location}"`);
        } else if (type === 3) {
          console.log(`[EXTERNAL - ❌] ${event.name}: Lieu manquant ou vide.`);
        } else {
          console.log(`[DISCORD - N/A] ${event.name}: (Type ${type})`);
        }
      });
    }
    console.log('-------------------------------------------------------------------');

    return events;
  } catch (err) {
    console.error('Erreur de réseau ou de parsing lors de la récupération des événements Discord:', err);
    return [];
  }
}

// Composant Client pour la carte et le géocodage
function EventMapClient({ initialEvents }: { initialEvents: DiscordEvent[] }) {
  const [apiKey, setApiKey] = useState<string | undefined>(undefined);
  const [mappedEvents, setMappedEvents] = useState<MappedEvent[]>([]);
  const [geocodingStatus, setGeocodingStatus] = useState<string>('pending');

  useEffect(() => {
    setApiKey(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  }, []);

  const addressEvents = useMemo(() => {
    return initialEvents.filter(event => !!event.entity_metadata?.location);
  }, [initialEvents]);

  useEffect(() => {
    if (!apiKey || geocodingStatus === 'complete' || addressEvents.length === 0) return;

    setGeocodingStatus('loading');

    if (!window.google || !window.google.maps || !window.google.maps.Geocoder) {
      console.error("L'API Google Maps (Geocoder) n'est pas encore chargée.");
      setGeocodingStatus('error');
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    let geocodedCount = 0;
    const tempMappedEvents: MappedEvent[] = [];

    const geocodeEvent = (event: DiscordEvent) => {
      const location = event.entity_metadata?.location;
      if (!location) {
        geocodedCount++;
        return;
      }

      geocoder.geocode({ address: location }, (results, status) => {
        geocodedCount++;
        if (status === 'OK' && results && results[0]) {
          const lat = results[0].geometry.location.lat();
          const lng = results[0].geometry.location.lng();

          tempMappedEvents.push({
            ...event,
            position: { lat, lng },
            isGeocoded: true,
          });
        } else {
          console.warn(`Géocodage échoué pour l'événement ${event.name}: ${status}`);
          tempMappedEvents.push({
            ...event,
            position: { lat: 0, lng: 0 },
            isGeocoded: false,
          });
        }

        if (geocodedCount === addressEvents.length) {
          setMappedEvents(tempMappedEvents.filter(e => e.isGeocoded));
          setGeocodingStatus('complete');
        }
      });
    };

    addressEvents.forEach(geocodeEvent);
  }, [apiKey, addressEvents]);

  const renderMap = () => (
    <APIProvider apiKey={apiKey!}>
      <Map
        defaultCenter={mappedEvents.length > 0 ? mappedEvents[0].position : toulousePosition}
        defaultZoom={13}
        mapId="toulouse-map"
        gestureHandling="greedy"
        disableDefaultUI
      >
        {mappedEvents.map(event => (
          <Marker
            key={event.id}
            position={event.position}
            title={`${event.name} - ${event.entity_metadata?.location}`}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#EF4444',
              fillOpacity: 0.9,
              strokeWeight: 0,
            }}
          />
        ))}
      </Map>
    </APIProvider>
  );

  const renderStatus = () => {
    if (!apiKey) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <p className="text-muted-foreground">La carte ne peut pas être chargée : Clé API Google Maps manquante.</p>
        </div>
      );
    }
    if (addressEvents.length === 0) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <p className="text-muted-foreground">Aucun événement avec une adresse à afficher sur la carte.</p>
        </div>
      );
    }
    if (geocodingStatus === 'loading') {
      return (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <p className="text-muted-foreground flex items-center gap-2">
            <PartyPopper className="animate-spin h-5 w-5 text-primary" />
            Chargement et géocodage de {addressEvents.length} événement(s)...
          </p>
        </div>
      );
    }
    if (geocodingStatus === 'complete' && mappedEvents.length === 0) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <p className="text-muted-foreground">
            {addressEvents.length} événement(s) trouvé(s) mais le géocodage a échoué pour tous.
          </p>
        </div>
      );
    }
    if (geocodingStatus === 'error') {
      return (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <p className="text-muted-foreground">
            Erreur de chargement de l'API Google Maps (Geocoder).
          </p>
        </div>
      );
    }
    return renderMap();
  };

  return (
    <div className="p-4 md:p-8">
      <header className="mb-8">
        <h1 className="font-headline text-4xl font-bold text-primary">Carte Interactive</h1>
        <p className="mt-2 text-muted-foreground">
          Localisation des événements externes "Fais Ta Sortie à Toulouse".
        </p>
      </header>

      {apiKey ? (
        <Alert className="mb-4">
          <PartyPopper className="h-4 w-4" />
          <AlertTitle>Statut du Géocodage</AlertTitle>
          <AlertDescription>
            {geocodingStatus === 'loading' && `Tentative de géocodage de ${addressEvents.length} événement(s)...`}
            {geocodingStatus === 'complete' &&
              `${mappedEvents.length} marqueur(s) affiché(s) sur ${addressEvents.length} événement(s) avec adresse.`}
            {geocodingStatus === 'error' && `Une erreur est survenue lors du chargement de l'API.`}
            {geocodingStatus === 'pending' && `En attente de chargement...`}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive" className="mb-4">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Configuration requise</AlertTitle>
          <AlertDescription>
            Une clé API Google Maps est nécessaire. Veuillez vérifier que <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> est bien définie.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="aspect-video w-full" style={{ minHeight: '400px' }}>
            {renderStatus()}
          </div>
        </CardContent>
      </Card>

      {/* --- Liste des événements sous la carte --- */}
      <div className="mt-8">
        <DiscordEvents events={initialEvents} />
      </div>
    </div>
  );
}

// --- Composant Serveur (SSR) ---
export default async function MapPage() {
  const eventsData = await fetchEventsData();
  return <EventMapClient initialEvents={eventsData} />;
}
