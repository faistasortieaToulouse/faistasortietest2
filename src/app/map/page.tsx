'use client';

import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TriangleAlert, PartyPopper } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

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
const GUILD_ID = '1422806103267344416'; // L'ID de votre Guilde

// --- Logique de Récupération des Événements Côté Serveur ---
async function fetchEventsData(): Promise<DiscordEvent[]> {
    const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
    if (!DISCORD_TOKEN) {
        console.warn("DISCORD_BOT_TOKEN est manquant. Les événements ne seront pas chargés sur la carte.");
        return [];
    }

    // Récupération avec cache désactivé pour s'assurer d'avoir les données à jour lors du SSR
    try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/scheduled-events`, {
            headers: { Authorization: `Bot ${DISCORD_TOKEN}` },
            next: { revalidate: 300 } // Réutiliser le même cache que le dashboard
        });

        if (!res.ok) {
            console.error(`Erreur lors de la récupération des événements Discord: ${res.status} ${res.statusText}`);
            return [];
        }
        return res.json();
    } catch (err) {
        console.error('Erreur de réseau ou de parsing lors de la récupération des événements Discord:', err);
        return [];
    }
}

// Composant Client pour la Carte et le Géocodage
function EventMapClient({ initialEvents }: { initialEvents: DiscordEvent[] }) {
    const [apiKey, setApiKey] = useState<string | undefined>(undefined);
    const [mappedEvents, setMappedEvents] = useState<MappedEvent[]>([]);
    const [geocodingStatus, setGeocodingStatus] = useState<string>('pending'); // pending, loading, complete, error

    useEffect(() => {
        // Lit la clé API côté client
        setApiKey(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
    }, []);

    const externalEvents = useMemo(() => {
        // Filtre les événements qui sont de type EXTERNAL (3) et qui ont une adresse
        return initialEvents.filter(event => 
            event.entity_type === 3 && event.entity_metadata?.location
        );
    }, [initialEvents]);

    // Hook d'effet pour effectuer le géocodage des adresses
    useEffect(() => {
        if (!apiKey || geocodingStatus === 'complete' || externalEvents.length === 0) return;

        setGeocodingStatus('loading');
        
        // Initialiser le Géocodeur après l'APIProvider
        const geocoder = new window.google.maps.Geocoder();
        let geocodedCount = 0;
        const tempMappedEvents: MappedEvent[] = [];

        // Fonction pour géocoder un seul événement
        const geocodeEvent = (event: DiscordEvent) => {
            const location = event.entity_metadata?.location;
            if (!location) return;

            // Utiliser le géocodage de Google Maps
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
                        position: { lat: 0, lng: 0 }, // Position par défaut/invalide
                        isGeocoded: false,
                    });
                }

                // Si tous les événements ont été traités
                if (geocodedCount === externalEvents.length) {
                    setMappedEvents(tempMappedEvents.filter(e => e.isGeocoded));
                    setGeocodingStatus('complete');
                }
            });
        };

        // Lancer le géocodage pour tous les événements externes
        externalEvents.forEach(geocodeEvent);

    }, [apiKey, externalEvents]);


    const renderMap = () => (
        <APIProvider apiKey={apiKey!}>
            <Map
                defaultCenter={toulousePosition}
                defaultZoom={13}
                mapId="toulouse-map"
                gestureHandling={'greedy'}
                disableDefaultUI={true}
            >
                {/* Marqueurs des événements Discord Géocodés */}
                {mappedEvents.map((event) => (
                    <Marker 
                        key={event.id} 
                        position={event.position} 
                        title={`${event.name} - ${event.scheduled_start_time}`} 
                        // Personnalisation simple de l'icône pour les événements
                        icon={{
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: '#EF4444', // Rouge (couleur d'alerte)
                            fillOpacity: 0.9,
                            strokeWeight: 0,
                        }}
                    />
                ))}
                
                {/* Vous pouvez laisser les "popularSpots" si vous voulez */}
                {/* {popularSpots.map((spot) => (
                    <Marker key={spot.id} position={spot.position} title={spot.name} />
                ))} */}
            </Map>
        </APIProvider>
    );
    
    // Message de chargement/statut
    const renderStatus = () => {
        if (!apiKey) {
            return (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                    <p className="text-muted-foreground">La carte ne peut pas être chargée : Clé API manquante.</p>
                </div>
            );
        }
        if (externalEvents.length === 0) {
            return (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                    <p className="text-muted-foreground">Aucun événement externe à afficher sur la carte.</p>
                </div>
            );
        }
        if (geocodingStatus === 'loading') {
            return (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                    <p className="text-muted-foreground flex items-center gap-2">
                        <PartyPopper className="animate-spin h-5 w-5 text-primary" />
                        Chargement des événements...
                    </p>
                </div>
            );
        }
        return renderMap();
    }

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
                    <AlertTitle>Événements trouvés</AlertTitle>
                    <AlertDescription>
                        {externalEvents.length} événements externes sont en cours de géocodage ou affichés.
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
        </div>
    );
}


// Composant Serveur (SSR)
export default async function MapPage() {
    // Cette partie s'exécute côté serveur
    const eventsData = await fetchEventsData();
    
    // Utilisation d'un composant client pour gérer le géocodage et la carte Google Maps
    return <EventMapClient initialEvents={eventsData} />;
}
