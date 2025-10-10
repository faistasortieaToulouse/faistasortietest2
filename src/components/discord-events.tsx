'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, Info, ExternalLink, MapPin, Mic } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from './ui/button';

// Mise à jour de l'interface pour inclure le lieu et le type d'entité
interface DiscordEvent {
  id: string;
  name: string;
  scheduled_start_time: string;
  channel_id: string | null; // Peut être null pour les événements EXTERNAL
  entity_type: 1 | 2 | 3; // 1: STAGE_INSTANCE, 2: VOICE, 3: EXTERNAL
  entity_metadata: {
    location?: string; // Contient l'adresse si entity_type est 3 (EXTERNAL)
  } | null;
}

// L'utilisation de 'export function' est essentielle pour correspondre à l'importation nommée dans page.tsx
export function DiscordEvents({ events }: { events?: DiscordEvent[] }) {
  const sortedEvents = events?.sort((a, b) => new Date(a.scheduled_start_time).getTime() - new Date(b.scheduled_start_time).getTime());

  // Fonction utilitaire pour déterminer le lieu de l'événement
  const getLocationInfo = (event: DiscordEvent) => {
    switch (event.entity_type) {
      case 2: // VOICE
        return {
          icon: <Mic className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-500" />,
          text: "Salon Vocal Discord",
          isLink: false,
        };
      case 3: // EXTERNAL
        // On utilise trim() pour nettoyer l'adresse et éviter que des chaînes vides ou avec des espaces soient traitées comme valides
        const locationText = event.entity_metadata?.location?.trim();
        return {
          icon: <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />,
          text: locationText && locationText.length > 0 ? locationText : "Lieu Externe non spécifié",
          isLink: locationText && locationText.length > 0, // C'est un lien seulement si on a une adresse valide
        };
      case 1: // STAGE_INSTANCE
        return {
          icon: <Mic className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-500" />,
          text: "Salon Stage Discord",
          isLink: false,
        };
      default:
        return {
          icon: <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-500" />,
          text: "Emplacement inconnu",
          isLink: false,
        };
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Événements à venir</CardTitle>
        <CardDescription>
          Voici les prochains événements prévus sur le serveur Discord.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sortedEvents && sortedEvents.length > 0 ? (
          <div className="space-y-4">
            {sortedEvents.map((event) => {
              const locationInfo = getLocationInfo(event);
                
              return (
                <div key={event.id} className="rounded-lg border bg-card p-4 shadow-sm transition hover:shadow-md">
                  <h3 className="mb-2 font-semibold text-primary">{event.name}</h3>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>{format(new Date(event.scheduled_start_time), "EEEE d MMMM yyyy", { locale: fr })}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>{format(new Date(event.scheduled_start_time), "HH'h'mm", { locale: fr })}</span>
                    </div>
                        
                    {/* AFFICHAGE DU LIEU */}
                    <div className="flex items-start gap-2">
                        {locationInfo.icon}
                        {locationInfo.isLink && locationInfo.text ? (
                            // Si c'est un lien externe (entité_type 3)
                            <a 
                                // Utilise l'adresse pour un lien Google Maps ou le lien brut si c'est une URL (http/https)
                                href={locationInfo.text.startsWith('http') ? locationInfo.text : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationInfo.text)}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline flex items-center"
                            >
                                {locationInfo.text}
                                <ExternalLink className="ml-1 h-3 w-3" />
                            </a>
                        ) : (
                            // Si c'est un salon vocal Discord ou un lieu non spécifié
                            <span className="font-medium text-foreground">{locationInfo.text}</span>
                        )}
                    </div>
                    {/* FIN AFFICHAGE DU LIEU */}
                  </div>
                  <Button asChild size="sm" variant="outline" className="mt-4 bg-primary hover:bg-primary/90 text-white hover:text-white border-primary">
                    <a href={`https://discord.com/events/1422806103267344416/${event.id}`} target="_blank" rel="noopener noreferrer">
                      Voir sur Discord
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground">Aucun événement à venir pour le moment.</p>
        )}
      </CardContent>
    </Card>
  );
}
