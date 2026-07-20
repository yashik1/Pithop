// Lightweight i18n: a flat dictionary per language, an English base that is the
// source of truth, and graceful fallback to English for any missing key. Adding
// a language = add its code to LANGUAGES and a dictionary below (any subset of
// keys; the rest fall back to English). Place names/descriptions come from
// Wikipedia/OSM and are NOT translated — only the app's own chrome is.

export type Lang =
  | 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'nl' | 'ru' | 'uk' | 'pl'
  | 'tr' | 'ar' | 'hi' | 'id' | 'vi' | 'zh' | 'ja' | 'ko';

export const LANGUAGES: Array<{ code: Lang; name: string; dir?: 'rtl' }> = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'ru', name: 'Русский' },
  { code: 'uk', name: 'Українська' },
  { code: 'pl', name: 'Polski' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
];

// Every translatable string, keyed. English values are what the UI shows when a
// language omits a key.
const en = {
  tagline: 'Fun stops, hidden gems and breaks along your drive',
  fromPh: 'From — city, address',
  toPh: 'To — city or address',
  find: 'Find stops along the way',
  drive: 'drive',
  stopsFound: '{n} stops found',
  aheadLabel: 'On the road: only stops ahead of me',
  maxDetour: 'Max detour',
  timeToSpend: 'Time to spend',
  visitQuick: 'Quick stop (≤ 15 min)',
  visitShort: 'Short (≤ 30 min)',
  visit1h: 'Up to 1 hour',
  visit2h: 'Up to 2 hours',
  visitAny: 'Any length',
  cat_fun: 'Attractions & Fun',
  cat_views: 'Viewpoints',
  cat_nature: 'Nature & Parks',
  cat_history: 'History',
  cat_museums: 'Museums & Culture',
  cat_food: 'Food & Drink',
  cat_rest: 'Rest Stops',
  yourStops: 'Your stops ({n})',
  startTrip: 'Start trip in Google Maps',
  share: 'Share',
  save: 'Save',
  clear: 'Clear',
  savedTrips: 'Saved trips',
  addPlace: 'Add a place',
  addPlaceArmed: 'Tap the map where the place is — or cancel ✕',
  shareTitle: 'Share a place with all travellers',
  namePh: 'Name — e.g. Riverside picnic spot',
  notePh: 'What makes it worth the stop? (optional)',
  parkingQ: 'Parking? (optional)',
  parkFree: 'Free parking',
  parkPaid: 'Paid parking',
  parkNone: 'No parking on site',
  shareBtn: 'Share with travellers',
  sharing: 'Sharing…',
  cancel: 'Cancel',
  addToTrip: 'Add to trip',
  removeFromTrip: 'Remove from trip',
  bookTickets: 'Book tickets',
  gasCashback: 'Gas cash back',
  report: 'Report',
  addedBy: 'Added by {name}',
  travellerTip: 'Traveller tip',
  signInPrompt: 'Sign in to add a place — it keeps community spots trustworthy.',
  continueGoogle: 'Continue with Google',
  googleWaiting: 'Waiting for Google…',
  orSep: 'or',
  email: 'Email',
  password: 'Password',
  passwordNew: 'Create a password',
  signIn: 'Sign in',
  createAccount: 'Create account',
  newHere: 'New here? Create an account',
  haveAccount: 'Have an account? Sign in',
  signedInAs: 'Signed in as',
  signOut: 'Sign out',
  offlineSaved: 'You are offline — showing your saved trip.',
  thanksAdded: 'Thanks — your place is now visible to all travellers.',
  tryLabel: 'Try:',
  hintBody:
    "Enter where you're driving from and to. Pithop maps your route and finds viewpoints, quirky attractions, nature, history and food along the way.",
  language: 'Language',
  website: 'Website',
  vehicle: 'Vehicle',
  veh_car: 'Car',
  veh_truck: 'Truck',
  veh_motorcycle: 'Motorcycle',
  veh_bike: 'Bicycle',
  vehNeedsKey: 'Needs the Geoapify key — only cars route on the free server',
  liveDrive: 'Drive live on the map',
  liveWaiting: 'Getting your location…',
  liveEta: 'ETA',
  liveEnd: 'End',
  liveRecenter: 'Re-centre on me',
  liveOffRoute: 'Off the planned route',
  liveArriving: 'Approaching {name}',
  liveDest: 'Destination',
  liveNoGeo: 'Live drive needs location access, which this browser does not support.',
  liveBlocked: 'Location is blocked — allow it via the icon in your address bar to drive live.',
  liveVoiceOn: 'Voice announcements on — tap to mute',
  liveVoiceOff: 'Voice muted — tap to unmute',
  liveInMile: 'In one mile',
  liveInKm: 'In one kilometer',
  liveArrived: 'You have arrived at your destination',
  spareTime: 'Spare time for stops:',
  fullDay: 'Full day',
  surpriseBtn: 'Surprise me',
  surpriseDone: 'Planned {n} great stops that fit your spare time — tap again to shuffle, or tweak below!',
  surpriseNone: "Couldn't fit any stops in that time — try a bigger budget or a wider detour.",
  vibeLabel: 'Trip vibe:',
  theme_weird: 'Roadside Weird',
  theme_foodie: 'Foodie run',
  theme_nature: 'Nature escape',
  theme_history: 'History buff',
  mealLunch: 'perfect for lunch',
  mealDinner: 'perfect for dinner',
  drivePassing: 'Passing {name}',
  tripCard: 'Trip card',
  tripCardSaved: 'Trip card downloaded — share it anywhere.',
  hoursOpen: 'Open now',
  hoursClosed: 'Closed',
  hoursUntil: 'until {t}',
  hoursOpens: 'opens {t}',
  hoursArriveOpen: 'Open when you arrive (~{t})',
  hoursArriveClosed: 'Closed when you arrive (~{t})',
  rouletteBtn: 'Feeling lucky?',
  rouletteTitle: 'Detour Roulette',
  rouletteDare: 'Dare you to take this one.',
  rouletteAdd: "I'm in — add it",
  rouletteRespin: 'Re-spin',
  rouletteChicken: 'Re-spins so far: {n} 🐔',
  rouletteNone: 'No candidates within your detour limit — widen it and spin again.',
  rouletteCommitted: 'Committed! Enjoy the detour.',
  bingoBtn: 'Road Trip Bingo',
  bingoHint: 'Tap what you spot along the way — four in a row wins!',
  bingoWin: 'BINGO! Four in a row 🎉',
};

export type TKey = keyof typeof en;

// Translations. Any subset of keys is fine — missing keys fall back to English.
// These are best-effort; a native review is recommended before wide release.
const dicts: Partial<Record<Lang, Partial<Record<TKey, string>>>> = {
  es: {
    tagline: 'Paradas divertidas, joyas ocultas y descansos en tu ruta',
    fromPh: 'Desde — ciudad, dirección', toPh: 'Hasta — ciudad o dirección',
    find: 'Buscar paradas en el camino', drive: 'de viaje', stopsFound: '{n} paradas encontradas',
    aheadLabel: 'En ruta: solo paradas por delante de mí', maxDetour: 'Desvío máximo', timeToSpend: 'Tiempo disponible',
    visitQuick: 'Parada rápida (≤ 15 min)', visitShort: 'Corta (≤ 30 min)', visit1h: 'Hasta 1 hora', visit2h: 'Hasta 2 horas', visitAny: 'Cualquier duración',
    cat_fun: 'Atracciones y diversión', cat_views: 'Miradores', cat_nature: 'Naturaleza y parques', cat_history: 'Historia', cat_museums: 'Museos y cultura', cat_food: 'Comida y bebida', cat_rest: 'Áreas de descanso',
    yourStops: 'Tus paradas ({n})', startTrip: 'Iniciar viaje en Google Maps', share: 'Compartir', save: 'Guardar', clear: 'Borrar', savedTrips: 'Viajes guardados',
    addPlace: 'Añadir un lugar', addPlaceArmed: 'Toca el mapa donde está el lugar — o cancela ✕', shareTitle: 'Comparte un lugar con todos los viajeros',
    namePh: 'Nombre — p. ej. Zona de pícnic junto al río', notePh: '¿Qué lo hace especial? (opcional)', parkingQ: '¿Aparcamiento? (opcional)',
    parkFree: 'Aparcamiento gratuito', parkPaid: 'Aparcamiento de pago', parkNone: 'Sin aparcamiento', shareBtn: 'Compartir con viajeros', sharing: 'Compartiendo…', cancel: 'Cancelar',
    addToTrip: 'Añadir al viaje', removeFromTrip: 'Quitar del viaje', bookTickets: 'Reservar entradas', gasCashback: 'Reembolso de gasolina', report: 'Reportar', addedBy: 'Añadido por {name}', travellerTip: 'Consejo de viajero',
    signInPrompt: 'Inicia sesión para añadir un lugar — mantiene la comunidad fiable.', continueGoogle: 'Continuar con Google', orSep: 'o', email: 'Correo', password: 'Contraseña', passwordNew: 'Crea una contraseña', signIn: 'Iniciar sesión', createAccount: 'Crear cuenta', newHere: '¿Nuevo? Crea una cuenta', haveAccount: '¿Ya tienes cuenta? Inicia sesión', signedInAs: 'Sesión iniciada como', signOut: 'Cerrar sesión',
    offlineSaved: 'Estás sin conexión — mostrando tu viaje guardado.', thanksAdded: 'Gracias — tu lugar ya es visible para todos los viajeros.', tryLabel: 'Prueba:',
    hintBody: 'Indica desde y hasta dónde conduces. Pithop traza tu ruta y encuentra miradores, atracciones curiosas, naturaleza, historia y comida por el camino.', language: 'Idioma', vehicle: 'Vehículo', veh_car: 'Coche', veh_truck: 'Camión', veh_motorcycle: 'Motocicleta', veh_bike: 'Bicicleta',
  },
  fr: {
    tagline: 'Des arrêts sympas, des pépites et des pauses sur votre route',
    fromPh: 'Départ — ville, adresse', toPh: 'Arrivée — ville ou adresse',
    find: 'Trouver des arrêts en chemin', drive: 'de route', stopsFound: '{n} arrêts trouvés',
    aheadLabel: 'En route : seulement les arrêts devant moi', maxDetour: 'Détour max', timeToSpend: 'Temps disponible',
    visitQuick: 'Arrêt rapide (≤ 15 min)', visitShort: 'Court (≤ 30 min)', visit1h: "Jusqu'à 1 heure", visit2h: "Jusqu'à 2 heures", visitAny: 'Toute durée',
    cat_fun: 'Attractions et loisirs', cat_views: 'Points de vue', cat_nature: 'Nature et parcs', cat_history: 'Histoire', cat_museums: 'Musées et culture', cat_food: 'Restauration', cat_rest: 'Aires de repos',
    yourStops: 'Vos arrêts ({n})', startTrip: 'Démarrer sur Google Maps', share: 'Partager', save: 'Enregistrer', clear: 'Effacer', savedTrips: 'Voyages enregistrés',
    addPlace: 'Ajouter un lieu', addPlaceArmed: "Touchez la carte à l'endroit du lieu — ou annulez ✕", shareTitle: 'Partagez un lieu avec tous les voyageurs',
    namePh: 'Nom — ex. Aire de pique-nique au bord de la rivière', notePh: "Qu'est-ce qui vaut l'arrêt ? (facultatif)", parkingQ: 'Parking ? (facultatif)',
    parkFree: 'Parking gratuit', parkPaid: 'Parking payant', parkNone: 'Pas de parking', shareBtn: 'Partager avec les voyageurs', sharing: 'Partage…', cancel: 'Annuler',
    addToTrip: 'Ajouter au trajet', removeFromTrip: 'Retirer du trajet', bookTickets: 'Réserver des billets', gasCashback: 'Remise carburant', report: 'Signaler', addedBy: 'Ajouté par {name}', travellerTip: 'Conseil de voyageur',
    signInPrompt: 'Connectez-vous pour ajouter un lieu — cela garde la communauté fiable.', continueGoogle: 'Continuer avec Google', orSep: 'ou', email: 'E-mail', password: 'Mot de passe', passwordNew: 'Créez un mot de passe', signIn: 'Se connecter', createAccount: 'Créer un compte', newHere: 'Nouveau ? Créez un compte', haveAccount: 'Déjà un compte ? Connectez-vous', signedInAs: 'Connecté en tant que', signOut: 'Se déconnecter',
    offlineSaved: 'Vous êtes hors ligne — affichage de votre voyage enregistré.', thanksAdded: 'Merci — votre lieu est maintenant visible par tous les voyageurs.', tryLabel: 'Essayez :',
    hintBody: 'Indiquez votre départ et votre arrivée. Pithop trace votre itinéraire et trouve points de vue, attractions insolites, nature, histoire et restauration en chemin.', language: 'Langue', vehicle: 'Véhicule', veh_car: 'Voiture', veh_truck: 'Camion', veh_motorcycle: 'Moto', veh_bike: 'Vélo',
  },
  de: {
    tagline: 'Coole Stopps, Geheimtipps und Pausen auf deiner Fahrt',
    fromPh: 'Von — Stadt, Adresse', toPh: 'Nach — Stadt oder Adresse',
    find: 'Stopps auf dem Weg finden', drive: 'Fahrt', stopsFound: '{n} Stopps gefunden',
    aheadLabel: 'Unterwegs: nur Stopps vor mir', maxDetour: 'Max. Umweg', timeToSpend: 'Verfügbare Zeit',
    visitQuick: 'Kurzstopp (≤ 15 Min)', visitShort: 'Kurz (≤ 30 Min)', visit1h: 'Bis zu 1 Stunde', visit2h: 'Bis zu 2 Stunden', visitAny: 'Beliebig lang',
    cat_fun: 'Attraktionen & Spaß', cat_views: 'Aussichtspunkte', cat_nature: 'Natur & Parks', cat_history: 'Geschichte', cat_museums: 'Museen & Kultur', cat_food: 'Essen & Trinken', cat_rest: 'Rastplätze',
    yourStops: 'Deine Stopps ({n})', startTrip: 'Route in Google Maps starten', share: 'Teilen', save: 'Speichern', clear: 'Löschen', savedTrips: 'Gespeicherte Reisen',
    addPlace: 'Ort hinzufügen', addPlaceArmed: 'Tippe auf die Karte, wo der Ort ist — oder abbrechen ✕', shareTitle: 'Teile einen Ort mit allen Reisenden',
    namePh: 'Name — z. B. Picknickplatz am Fluss', notePh: 'Was macht den Stopp lohnenswert? (optional)', parkingQ: 'Parken? (optional)',
    parkFree: 'Kostenloses Parken', parkPaid: 'Kostenpflichtiges Parken', parkNone: 'Kein Parkplatz', shareBtn: 'Mit Reisenden teilen', sharing: 'Teilen…', cancel: 'Abbrechen',
    addToTrip: 'Zur Reise hinzufügen', removeFromTrip: 'Aus Reise entfernen', bookTickets: 'Tickets buchen', gasCashback: 'Tank-Cashback', report: 'Melden', addedBy: 'Hinzugefügt von {name}', travellerTip: 'Reisetipp',
    signInPrompt: 'Melde dich an, um einen Ort hinzuzufügen — das hält die Community vertrauenswürdig.', continueGoogle: 'Mit Google fortfahren', orSep: 'oder', email: 'E-Mail', password: 'Passwort', passwordNew: 'Passwort erstellen', signIn: 'Anmelden', createAccount: 'Konto erstellen', newHere: 'Neu hier? Konto erstellen', haveAccount: 'Schon ein Konto? Anmelden', signedInAs: 'Angemeldet als', signOut: 'Abmelden',
    offlineSaved: 'Du bist offline — zeige deine gespeicherte Reise.', thanksAdded: 'Danke — dein Ort ist jetzt für alle Reisenden sichtbar.', tryLabel: 'Probier:',
    hintBody: 'Gib ein, von wo nach wo du fährst. Pithop zeichnet deine Route und findet Aussichtspunkte, kuriose Attraktionen, Natur, Geschichte und Essen am Weg.', language: 'Sprache', vehicle: 'Fahrzeug', veh_car: 'Auto', veh_truck: 'LKW', veh_motorcycle: 'Motorrad', veh_bike: 'Fahrrad',
  },
  pt: {
    tagline: 'Paradas divertidas, joias escondidas e pausas na sua viagem',
    fromPh: 'De — cidade, endereço', toPh: 'Para — cidade ou endereço',
    find: 'Encontrar paradas no caminho', drive: 'de viagem', stopsFound: '{n} paradas encontradas',
    aheadLabel: 'Na estrada: só paradas à minha frente', maxDetour: 'Desvio máx.', timeToSpend: 'Tempo disponível',
    visitQuick: 'Parada rápida (≤ 15 min)', visitShort: 'Curta (≤ 30 min)', visit1h: 'Até 1 hora', visit2h: 'Até 2 horas', visitAny: 'Qualquer duração',
    cat_fun: 'Atrações e diversão', cat_views: 'Miradouros', cat_nature: 'Natureza e parques', cat_history: 'História', cat_museums: 'Museus e cultura', cat_food: 'Comida e bebida', cat_rest: 'Áreas de descanso',
    yourStops: 'Suas paradas ({n})', startTrip: 'Iniciar viagem no Google Maps', share: 'Partilhar', save: 'Guardar', clear: 'Limpar', savedTrips: 'Viagens guardadas',
    addPlace: 'Adicionar um lugar', addPlaceArmed: 'Toque no mapa onde fica o lugar — ou cancele ✕', shareTitle: 'Partilhe um lugar com todos os viajantes',
    namePh: 'Nome — ex.: Área de piquenique junto ao rio', notePh: 'O que torna a parada especial? (opcional)', parkingQ: 'Estacionamento? (opcional)',
    parkFree: 'Estacionamento gratuito', parkPaid: 'Estacionamento pago', parkNone: 'Sem estacionamento', shareBtn: 'Partilhar com viajantes', sharing: 'A partilhar…', cancel: 'Cancelar',
    addToTrip: 'Adicionar à viagem', removeFromTrip: 'Remover da viagem', bookTickets: 'Reservar bilhetes', gasCashback: 'Reembolso de combustível', report: 'Denunciar', addedBy: 'Adicionado por {name}', travellerTip: 'Dica de viajante',
    signInPrompt: 'Inicie sessão para adicionar um lugar — mantém a comunidade fiável.', continueGoogle: 'Continuar com o Google', orSep: 'ou', email: 'E-mail', password: 'Palavra-passe', passwordNew: 'Crie uma palavra-passe', signIn: 'Entrar', createAccount: 'Criar conta', newHere: 'Novo aqui? Crie uma conta', haveAccount: 'Já tem conta? Entrar', signedInAs: 'Sessão iniciada como', signOut: 'Sair',
    offlineSaved: 'Está offline — a mostrar a sua viagem guardada.', thanksAdded: 'Obrigado — o seu lugar já é visível para todos os viajantes.', tryLabel: 'Experimente:',
    hintBody: 'Indique de onde e para onde vai. O Pithop traça a rota e encontra miradouros, atrações curiosas, natureza, história e comida pelo caminho.', language: 'Idioma', vehicle: 'Veículo', veh_car: 'Carro', veh_truck: 'Camião', veh_motorcycle: 'Motocicleta', veh_bike: 'Bicicleta',
  },
  it: {
    tagline: 'Soste divertenti, gemme nascoste e pause lungo il viaggio',
    fromPh: 'Da — città, indirizzo', toPh: 'A — città o indirizzo',
    find: 'Trova soste lungo il percorso', drive: 'di viaggio', stopsFound: '{n} soste trovate',
    aheadLabel: 'In viaggio: solo soste davanti a me', maxDetour: 'Deviazione max', timeToSpend: 'Tempo disponibile',
    visitQuick: 'Sosta rapida (≤ 15 min)', visitShort: 'Breve (≤ 30 min)', visit1h: 'Fino a 1 ora', visit2h: 'Fino a 2 ore', visitAny: 'Qualsiasi durata',
    cat_fun: 'Attrazioni e divertimento', cat_views: 'Punti panoramici', cat_nature: 'Natura e parchi', cat_history: 'Storia', cat_museums: 'Musei e cultura', cat_food: 'Cibo e bevande', cat_rest: 'Aree di sosta',
    yourStops: 'Le tue soste ({n})', startTrip: 'Avvia il viaggio su Google Maps', share: 'Condividi', save: 'Salva', clear: 'Cancella', savedTrips: 'Viaggi salvati',
    addPlace: 'Aggiungi un luogo', addPlaceArmed: 'Tocca la mappa dove si trova il luogo — o annulla ✕', shareTitle: 'Condividi un luogo con tutti i viaggiatori',
    namePh: 'Nome — es. Area picnic sul fiume', notePh: 'Cosa rende speciale la sosta? (facoltativo)', parkingQ: 'Parcheggio? (facoltativo)',
    parkFree: 'Parcheggio gratuito', parkPaid: 'Parcheggio a pagamento', parkNone: 'Nessun parcheggio', shareBtn: 'Condividi con i viaggiatori', sharing: 'Condivisione…', cancel: 'Annulla',
    addToTrip: 'Aggiungi al viaggio', removeFromTrip: 'Rimuovi dal viaggio', bookTickets: 'Prenota biglietti', gasCashback: 'Rimborso carburante', report: 'Segnala', addedBy: 'Aggiunto da {name}', travellerTip: 'Consiglio di viaggio',
    signInPrompt: 'Accedi per aggiungere un luogo — mantiene la community affidabile.', continueGoogle: 'Continua con Google', orSep: 'o', email: 'Email', password: 'Password', passwordNew: 'Crea una password', signIn: 'Accedi', createAccount: 'Crea account', newHere: 'Nuovo? Crea un account', haveAccount: 'Hai un account? Accedi', signedInAs: 'Accesso come', signOut: 'Esci',
    offlineSaved: 'Sei offline — mostro il tuo viaggio salvato.', thanksAdded: 'Grazie — il tuo luogo è ora visibile a tutti i viaggiatori.', tryLabel: 'Prova:',
    hintBody: 'Inserisci da dove a dove guidi. Pithop traccia il percorso e trova punti panoramici, attrazioni curiose, natura, storia e cibo lungo la strada.', language: 'Lingua', vehicle: 'Veicolo', veh_car: 'Auto', veh_truck: 'Camion', veh_motorcycle: 'Moto', veh_bike: 'Bicicletta',
  },
  nl: {
    tagline: 'Leuke stops, verborgen pareltjes en pauzes onderweg',
    fromPh: 'Van — stad, adres', toPh: 'Naar — stad of adres',
    find: 'Vind stops onderweg', drive: 'rijden', stopsFound: '{n} stops gevonden',
    aheadLabel: 'Onderweg: alleen stops voor me', maxDetour: 'Max. omweg', timeToSpend: 'Beschikbare tijd',
    visitQuick: 'Korte stop (≤ 15 min)', visitShort: 'Kort (≤ 30 min)', visit1h: 'Tot 1 uur', visit2h: 'Tot 2 uur', visitAny: 'Elke duur',
    cat_fun: 'Attracties & plezier', cat_views: 'Uitzichtpunten', cat_nature: 'Natuur & parken', cat_history: 'Geschiedenis', cat_museums: 'Musea & cultuur', cat_food: 'Eten & drinken', cat_rest: 'Rustplaatsen',
    yourStops: 'Jouw stops ({n})', startTrip: 'Start rit in Google Maps', share: 'Delen', save: 'Opslaan', clear: 'Wissen', savedTrips: 'Opgeslagen ritten',
    addPlace: 'Plek toevoegen', addPlaceArmed: 'Tik op de kaart waar de plek is — of annuleer ✕', shareTitle: 'Deel een plek met alle reizigers',
    namePh: 'Naam — bijv. Picknickplek aan de rivier', notePh: 'Wat maakt de stop de moeite waard? (optioneel)', parkingQ: 'Parkeren? (optioneel)',
    parkFree: 'Gratis parkeren', parkPaid: 'Betaald parkeren', parkNone: 'Geen parkeergelegenheid', shareBtn: 'Delen met reizigers', sharing: 'Delen…', cancel: 'Annuleren',
    addToTrip: 'Aan rit toevoegen', removeFromTrip: 'Uit rit verwijderen', bookTickets: 'Tickets boeken', gasCashback: 'Brandstof-cashback', report: 'Melden', addedBy: 'Toegevoegd door {name}', travellerTip: 'Reizigerstip',
    signInPrompt: 'Log in om een plek toe te voegen — zo blijft de community betrouwbaar.', continueGoogle: 'Doorgaan met Google', orSep: 'of', email: 'E-mail', password: 'Wachtwoord', passwordNew: 'Maak een wachtwoord', signIn: 'Inloggen', createAccount: 'Account maken', newHere: 'Nieuw hier? Account maken', haveAccount: 'Al een account? Inloggen', signedInAs: 'Ingelogd als', signOut: 'Uitloggen',
    offlineSaved: 'Je bent offline — je opgeslagen rit wordt getoond.', thanksAdded: 'Bedankt — je plek is nu zichtbaar voor alle reizigers.', tryLabel: 'Probeer:',
    hintBody: 'Vul in van en naar waar je rijdt. Pithop tekent je route en vindt uitzichtpunten, eigenzinnige attracties, natuur, geschiedenis en eten onderweg.', language: 'Taal', vehicle: 'Voertuig', veh_car: 'Auto', veh_truck: 'Vrachtwagen', veh_motorcycle: 'Motor', veh_bike: 'Fiets',
  },
  ru: {
    tagline: 'Интересные остановки, скрытые жемчужины и паузы в пути',
    fromPh: 'Откуда — город, адрес', toPh: 'Куда — город или адрес',
    find: 'Найти остановки по пути', drive: 'в пути', stopsFound: 'найдено остановок: {n}',
    aheadLabel: 'В дороге: только остановки впереди', maxDetour: 'Макс. крюк', timeToSpend: 'Сколько времени есть',
    visitQuick: 'Быстрая (≤ 15 мин)', visitShort: 'Короткая (≤ 30 мин)', visit1h: 'До 1 часа', visit2h: 'До 2 часов', visitAny: 'Любая',
    cat_fun: 'Аттракционы и развлечения', cat_views: 'Смотровые площадки', cat_nature: 'Природа и парки', cat_history: 'История', cat_museums: 'Музеи и культура', cat_food: 'Еда и напитки', cat_rest: 'Зоны отдыха',
    yourStops: 'Ваши остановки ({n})', startTrip: 'Запустить в Google Maps', share: 'Поделиться', save: 'Сохранить', clear: 'Очистить', savedTrips: 'Сохранённые поездки',
    addPlace: 'Добавить место', addPlaceArmed: 'Коснитесь карты в нужном месте — или отмените ✕', shareTitle: 'Поделитесь местом со всеми путешественниками',
    namePh: 'Название — напр. Пикник у реки', notePh: 'Чем это место стоит остановки? (необязательно)', parkingQ: 'Парковка? (необязательно)',
    parkFree: 'Бесплатная парковка', parkPaid: 'Платная парковка', parkNone: 'Парковки нет', shareBtn: 'Поделиться с путешественниками', sharing: 'Отправка…', cancel: 'Отмена',
    addToTrip: 'Добавить в поездку', removeFromTrip: 'Убрать из поездки', bookTickets: 'Купить билеты', gasCashback: 'Кэшбэк за топливо', report: 'Пожаловаться', addedBy: 'Добавил {name}', travellerTip: 'Совет путешественника',
    signInPrompt: 'Войдите, чтобы добавить место — это делает сообщество надёжным.', continueGoogle: 'Продолжить с Google', orSep: 'или', email: 'Эл. почта', password: 'Пароль', passwordNew: 'Придумайте пароль', signIn: 'Войти', createAccount: 'Создать аккаунт', newHere: 'Впервые? Создайте аккаунт', haveAccount: 'Уже есть аккаунт? Войти', signedInAs: 'Вы вошли как', signOut: 'Выйти',
    offlineSaved: 'Вы офлайн — показываем сохранённую поездку.', thanksAdded: 'Спасибо — ваше место теперь видно всем путешественникам.', tryLabel: 'Попробуйте:',
    hintBody: 'Укажите, откуда и куда едете. Pithop построит маршрут и найдёт смотровые площадки, необычные достопримечательности, природу, историю и еду по пути.', language: 'Язык', vehicle: 'Транспорт', veh_car: 'Автомобиль', veh_truck: 'Грузовик', veh_motorcycle: 'Мотоцикл', veh_bike: 'Велосипед',
  },
  uk: {
    tagline: 'Цікаві зупинки, приховані перлини та паузи в дорозі',
    fromPh: 'Звідки — місто, адреса', toPh: 'Куди — місто чи адреса',
    find: 'Знайти зупинки по дорозі', drive: 'у дорозі', stopsFound: 'знайдено зупинок: {n}',
    aheadLabel: 'У дорозі: лише зупинки попереду', maxDetour: 'Макс. гак', timeToSpend: 'Скільки є часу',
    visitQuick: 'Швидка (≤ 15 хв)', visitShort: 'Коротка (≤ 30 хв)', visit1h: 'До 1 години', visit2h: 'До 2 годин', visitAny: 'Будь-яка',
    cat_fun: 'Розваги та атракції', cat_views: 'Оглядові точки', cat_nature: 'Природа та парки', cat_history: 'Історія', cat_museums: 'Музеї та культура', cat_food: 'Їжа та напої', cat_rest: 'Зони відпочинку',
    yourStops: 'Ваші зупинки ({n})', startTrip: 'Почати в Google Maps', share: 'Поділитися', save: 'Зберегти', clear: 'Очистити', savedTrips: 'Збережені поїздки',
    addPlace: 'Додати місце', addPlaceArmed: 'Торкніться карти в потрібному місці — або скасуйте ✕', shareTitle: 'Поділіться місцем з усіма мандрівниками',
    namePh: 'Назва — напр. Пікнік біля річки', notePh: 'Чим це місце варте зупинки? (необовʼязково)', parkingQ: 'Паркування? (необовʼязково)',
    parkFree: 'Безкоштовне паркування', parkPaid: 'Платне паркування', parkNone: 'Паркування немає', shareBtn: 'Поділитися з мандрівниками', sharing: 'Надсилання…', cancel: 'Скасувати',
    addToTrip: 'Додати до поїздки', removeFromTrip: 'Прибрати з поїздки', bookTickets: 'Купити квитки', gasCashback: 'Кешбек за пальне', report: 'Поскаржитися', addedBy: 'Додав {name}', travellerTip: 'Порада мандрівника',
    signInPrompt: 'Увійдіть, щоб додати місце — це робить спільноту надійною.', continueGoogle: 'Продовжити з Google', orSep: 'або', email: 'Ел. пошта', password: 'Пароль', passwordNew: 'Придумайте пароль', signIn: 'Увійти', createAccount: 'Створити акаунт', newHere: 'Уперше? Створіть акаунт', haveAccount: 'Вже є акаунт? Увійти', signedInAs: 'Ви увійшли як', signOut: 'Вийти',
    offlineSaved: 'Ви офлайн — показуємо збережену поїздку.', thanksAdded: 'Дякуємо — ваше місце тепер бачать усі мандрівники.', tryLabel: 'Спробуйте:',
    hintBody: 'Вкажіть, звідки й куди їдете. Pithop побудує маршрут і знайде оглядові точки, незвичні атракції, природу, історію та їжу дорогою.', language: 'Мова', vehicle: 'Транспорт', veh_car: 'Автомобіль', veh_truck: 'Вантажівка', veh_motorcycle: 'Мотоцикл', veh_bike: 'Велосипед',
  },
  pl: {
    tagline: 'Ciekawe przystanki, ukryte perełki i przerwy w podróży',
    fromPh: 'Skąd — miasto, adres', toPh: 'Dokąd — miasto lub adres',
    find: 'Znajdź przystanki po drodze', drive: 'jazdy', stopsFound: 'znaleziono przystanków: {n}',
    aheadLabel: 'W trasie: tylko przystanki przede mną', maxDetour: 'Maks. objazd', timeToSpend: 'Dostępny czas',
    visitQuick: 'Szybki (≤ 15 min)', visitShort: 'Krótki (≤ 30 min)', visit1h: 'Do 1 godziny', visit2h: 'Do 2 godzin', visitAny: 'Dowolny',
    cat_fun: 'Atrakcje i rozrywka', cat_views: 'Punkty widokowe', cat_nature: 'Natura i parki', cat_history: 'Historia', cat_museums: 'Muzea i kultura', cat_food: 'Jedzenie i picie', cat_rest: 'Miejsca odpoczynku',
    yourStops: 'Twoje przystanki ({n})', startTrip: 'Rozpocznij w Mapach Google', share: 'Udostępnij', save: 'Zapisz', clear: 'Wyczyść', savedTrips: 'Zapisane podróże',
    addPlace: 'Dodaj miejsce', addPlaceArmed: 'Dotknij mapy w miejscu — lub anuluj ✕', shareTitle: 'Podziel się miejscem ze wszystkimi podróżnymi',
    namePh: 'Nazwa — np. Miejsce piknikowe nad rzeką', notePh: 'Co czyni ten przystanek wartościowym? (opcjonalnie)', parkingQ: 'Parking? (opcjonalnie)',
    parkFree: 'Parking bezpłatny', parkPaid: 'Parking płatny', parkNone: 'Brak parkingu', shareBtn: 'Udostępnij podróżnym', sharing: 'Udostępnianie…', cancel: 'Anuluj',
    addToTrip: 'Dodaj do podróży', removeFromTrip: 'Usuń z podróży', bookTickets: 'Zarezerwuj bilety', gasCashback: 'Zwrot za paliwo', report: 'Zgłoś', addedBy: 'Dodane przez {name}', travellerTip: 'Porada podróżnika',
    signInPrompt: 'Zaloguj się, aby dodać miejsce — to utrzymuje wiarygodność społeczności.', continueGoogle: 'Kontynuuj z Google', orSep: 'lub', email: 'E-mail', password: 'Hasło', passwordNew: 'Utwórz hasło', signIn: 'Zaloguj się', createAccount: 'Utwórz konto', newHere: 'Nowy? Utwórz konto', haveAccount: 'Masz konto? Zaloguj się', signedInAs: 'Zalogowano jako', signOut: 'Wyloguj',
    offlineSaved: 'Jesteś offline — pokazujemy zapisaną podróż.', thanksAdded: 'Dziękujemy — Twoje miejsce jest teraz widoczne dla wszystkich.', tryLabel: 'Spróbuj:',
    hintBody: 'Podaj skąd i dokąd jedziesz. Pithop wyznaczy trasę i znajdzie punkty widokowe, ciekawe atrakcje, przyrodę, historię i jedzenie po drodze.', language: 'Język', vehicle: 'Pojazd', veh_car: 'Samochód', veh_truck: 'Ciężarówka', veh_motorcycle: 'Motocykl', veh_bike: 'Rower',
  },
  tr: {
    tagline: 'Yol boyunca eğlenceli duraklar, gizli cevherler ve molalar',
    fromPh: 'Nereden — şehir, adres', toPh: 'Nereye — şehir veya adres',
    find: 'Yol üstü durakları bul', drive: 'sürüş', stopsFound: '{n} durak bulundu',
    aheadLabel: 'Yolda: yalnızca önümdeki duraklar', maxDetour: 'En fazla sapma', timeToSpend: 'Ayrılacak süre',
    visitQuick: 'Hızlı durak (≤ 15 dk)', visitShort: 'Kısa (≤ 30 dk)', visit1h: '1 saate kadar', visit2h: '2 saate kadar', visitAny: 'Herhangi bir süre',
    cat_fun: 'Cazibe ve eğlence', cat_views: 'Manzara noktaları', cat_nature: 'Doğa ve parklar', cat_history: 'Tarih', cat_museums: 'Müzeler ve kültür', cat_food: 'Yeme içme', cat_rest: 'Dinlenme yerleri',
    yourStops: 'Duraklarınız ({n})', startTrip: 'Google Haritalar’da başlat', share: 'Paylaş', save: 'Kaydet', clear: 'Temizle', savedTrips: 'Kayıtlı geziler',
    addPlace: 'Bir yer ekle', addPlaceArmed: 'Yerin olduğu noktada haritaya dokun — ya da iptal et ✕', shareTitle: 'Bir yeri tüm gezginlerle paylaş',
    namePh: 'Ad — örn. Nehir kenarı piknik alanı', notePh: 'Durağı değerli kılan ne? (isteğe bağlı)', parkingQ: 'Otopark? (isteğe bağlı)',
    parkFree: 'Ücretsiz otopark', parkPaid: 'Ücretli otopark', parkNone: 'Otopark yok', shareBtn: 'Gezginlerle paylaş', sharing: 'Paylaşılıyor…', cancel: 'İptal',
    addToTrip: 'Geziye ekle', removeFromTrip: 'Geziden çıkar', bookTickets: 'Bilet al', gasCashback: 'Yakıt iadesi', report: 'Bildir', addedBy: 'Ekleyen: {name}', travellerTip: 'Gezgin ipucu',
    signInPrompt: 'Yer eklemek için giriş yap — bu topluluğu güvenilir tutar.', continueGoogle: 'Google ile devam et', orSep: 'veya', email: 'E-posta', password: 'Şifre', passwordNew: 'Bir şifre oluştur', signIn: 'Giriş yap', createAccount: 'Hesap oluştur', newHere: 'Yeni misin? Hesap oluştur', haveAccount: 'Hesabın var mı? Giriş yap', signedInAs: 'Giriş yapıldı:', signOut: 'Çıkış yap',
    offlineSaved: 'Çevrimdışısın — kayıtlı gezin gösteriliyor.', thanksAdded: 'Teşekkürler — yerin artık tüm gezginlere görünüyor.', tryLabel: 'Deneyin:',
    hintBody: 'Nereden nereye gittiğini gir. Pithop rotanı çizer ve yol boyunca manzara noktaları, ilginç yerler, doğa, tarih ve yemek bulur.', language: 'Dil', vehicle: 'Araç', veh_car: 'Araba', veh_truck: 'Kamyon', veh_motorcycle: 'Motosiklet', veh_bike: 'Bisiklet',
  },
  ar: {
    tagline: 'محطات ممتعة وكنوز خفية واستراحات على طول رحلتك',
    fromPh: 'من — مدينة أو عنوان', toPh: 'إلى — مدينة أو عنوان',
    find: 'ابحث عن محطات في الطريق', drive: 'قيادة', stopsFound: 'تم العثور على {n} محطة',
    aheadLabel: 'على الطريق: المحطات أمامي فقط', maxDetour: 'أقصى انعطاف', timeToSpend: 'الوقت المتاح',
    visitQuick: 'وقفة سريعة (≤ ١٥ دقيقة)', visitShort: 'قصيرة (≤ ٣٠ دقيقة)', visit1h: 'حتى ساعة', visit2h: 'حتى ساعتين', visitAny: 'أي مدة',
    cat_fun: 'معالم ومرح', cat_views: 'نقاط مشاهدة', cat_nature: 'طبيعة وحدائق', cat_history: 'تاريخ', cat_museums: 'متاحف وثقافة', cat_food: 'طعام وشراب', cat_rest: 'أماكن استراحة',
    yourStops: 'محطاتك ({n})', startTrip: 'ابدأ الرحلة في خرائط Google', share: 'مشاركة', save: 'حفظ', clear: 'مسح', savedTrips: 'الرحلات المحفوظة',
    addPlace: 'أضف مكانًا', addPlaceArmed: 'انقر على الخريطة عند المكان — أو ألغِ ✕', shareTitle: 'شارك مكانًا مع كل المسافرين',
    namePh: 'الاسم — مثال: منطقة نزهة قرب النهر', notePh: 'ما الذي يستحق التوقف؟ (اختياري)', parkingQ: 'موقف سيارات؟ (اختياري)',
    parkFree: 'موقف مجاني', parkPaid: 'موقف مدفوع', parkNone: 'لا يوجد موقف', shareBtn: 'شارك مع المسافرين', sharing: 'جارٍ المشاركة…', cancel: 'إلغاء',
    addToTrip: 'أضف إلى الرحلة', removeFromTrip: 'أزل من الرحلة', bookTickets: 'احجز التذاكر', gasCashback: 'استرداد الوقود', report: 'إبلاغ', addedBy: 'أضافه {name}', travellerTip: 'نصيحة مسافر',
    signInPrompt: 'سجّل الدخول لإضافة مكان — هذا يحافظ على مصداقية المجتمع.', continueGoogle: 'المتابعة عبر Google', orSep: 'أو', email: 'البريد الإلكتروني', password: 'كلمة المرور', passwordNew: 'أنشئ كلمة مرور', signIn: 'تسجيل الدخول', createAccount: 'إنشاء حساب', newHere: 'جديد هنا؟ أنشئ حسابًا', haveAccount: 'لديك حساب؟ سجّل الدخول', signedInAs: 'مسجّل الدخول باسم', signOut: 'تسجيل الخروج',
    offlineSaved: 'أنت غير متصل — عرض رحلتك المحفوظة.', thanksAdded: 'شكرًا — مكانك الآن ظاهر لكل المسافرين.', tryLabel: 'جرّب:',
    hintBody: 'أدخل من أين وإلى أين تقود. يرسم Pithop مسارك ويجد نقاط مشاهدة ومعالم طريفة وطبيعة وتاريخًا وطعامًا على الطريق.', language: 'اللغة', vehicle: 'المركبة', veh_car: 'سيارة', veh_truck: 'شاحنة', veh_motorcycle: 'دراجة نارية', veh_bike: 'دراجة',
  },
  hi: {
    tagline: 'रास्ते भर मज़ेदार पड़ाव, छुपे रत्न और ब्रेक',
    fromPh: 'कहाँ से — शहर, पता', toPh: 'कहाँ तक — शहर या पता',
    find: 'रास्ते में पड़ाव खोजें', drive: 'ड्राइव', stopsFound: '{n} पड़ाव मिले',
    aheadLabel: 'सफ़र में: सिर्फ़ आगे के पड़ाव', maxDetour: 'अधिकतम मोड़', timeToSpend: 'बिताने का समय',
    visitQuick: 'झटपट (≤ 15 मिनट)', visitShort: 'छोटा (≤ 30 मिनट)', visit1h: '1 घंटे तक', visit2h: '2 घंटे तक', visitAny: 'कोई भी अवधि',
    cat_fun: 'आकर्षण और मस्ती', cat_views: 'व्यू पॉइंट', cat_nature: 'प्रकृति और पार्क', cat_history: 'इतिहास', cat_museums: 'संग्रहालय और संस्कृति', cat_food: 'खाना-पीना', cat_rest: 'विश्राम स्थल',
    yourStops: 'आपके पड़ाव ({n})', startTrip: 'Google Maps में यात्रा शुरू करें', share: 'साझा करें', save: 'सहेजें', clear: 'साफ़ करें', savedTrips: 'सहेजी यात्राएँ',
    addPlace: 'एक जगह जोड़ें', addPlaceArmed: 'जहाँ जगह है वहाँ मानचित्र पर टैप करें — या रद्द करें ✕', shareTitle: 'सभी यात्रियों के साथ एक जगह साझा करें',
    namePh: 'नाम — जैसे नदी किनारे पिकनिक स्थल', notePh: 'यह पड़ाव क्यों ख़ास है? (वैकल्पिक)', parkingQ: 'पार्किंग? (वैकल्पिक)',
    parkFree: 'मुफ़्त पार्किंग', parkPaid: 'सशुल्क पार्किंग', parkNone: 'पार्किंग नहीं', shareBtn: 'यात्रियों के साथ साझा करें', sharing: 'साझा हो रहा है…', cancel: 'रद्द करें',
    addToTrip: 'यात्रा में जोड़ें', removeFromTrip: 'यात्रा से हटाएँ', bookTickets: 'टिकट बुक करें', gasCashback: 'ईंधन कैशबैक', report: 'रिपोर्ट करें', addedBy: '{name} द्वारा जोड़ा गया', travellerTip: 'यात्री सुझाव',
    signInPrompt: 'जगह जोड़ने के लिए साइन इन करें — इससे समुदाय भरोसेमंद रहता है।', continueGoogle: 'Google से जारी रखें', orSep: 'या', email: 'ईमेल', password: 'पासवर्ड', passwordNew: 'पासवर्ड बनाएँ', signIn: 'साइन इन', createAccount: 'खाता बनाएँ', newHere: 'नए हैं? खाता बनाएँ', haveAccount: 'खाता है? साइन इन करें', signedInAs: 'साइन इन:', signOut: 'साइन आउट',
    offlineSaved: 'आप ऑफ़लाइन हैं — आपकी सहेजी यात्रा दिखाई जा रही है।', thanksAdded: 'धन्यवाद — आपकी जगह अब सभी यात्रियों को दिखेगी।', tryLabel: 'आज़माएँ:',
    hintBody: 'बताएँ कहाँ से कहाँ जा रहे हैं। Pithop आपका मार्ग बनाता है और रास्ते में व्यू पॉइंट, अनोखे आकर्षण, प्रकृति, इतिहास और खाना खोजता है।', language: 'भाषा', vehicle: 'वाहन', veh_car: 'कार', veh_truck: 'ट्रक', veh_motorcycle: 'मोटरसाइकिल', veh_bike: 'साइकिल',
  },
  id: {
    tagline: 'Perhentian seru, permata tersembunyi, dan istirahat di perjalanan',
    fromPh: 'Dari — kota, alamat', toPh: 'Ke — kota atau alamat',
    find: 'Cari perhentian di jalan', drive: 'berkendara', stopsFound: '{n} perhentian ditemukan',
    aheadLabel: 'Di jalan: hanya perhentian di depan', maxDetour: 'Belok maks.', timeToSpend: 'Waktu tersedia',
    visitQuick: 'Cepat (≤ 15 mnt)', visitShort: 'Singkat (≤ 30 mnt)', visit1h: 'Hingga 1 jam', visit2h: 'Hingga 2 jam', visitAny: 'Berapa pun',
    cat_fun: 'Atraksi & hiburan', cat_views: 'Titik pandang', cat_nature: 'Alam & taman', cat_history: 'Sejarah', cat_museums: 'Museum & budaya', cat_food: 'Makanan & minuman', cat_rest: 'Tempat istirahat',
    yourStops: 'Perhentian Anda ({n})', startTrip: 'Mulai di Google Maps', share: 'Bagikan', save: 'Simpan', clear: 'Hapus', savedTrips: 'Perjalanan tersimpan',
    addPlace: 'Tambah tempat', addPlaceArmed: 'Ketuk peta di lokasi tempat — atau batal ✕', shareTitle: 'Bagikan tempat ke semua pelancong',
    namePh: 'Nama — mis. Area piknik tepi sungai', notePh: 'Apa yang membuatnya layak disinggahi? (opsional)', parkingQ: 'Parkir? (opsional)',
    parkFree: 'Parkir gratis', parkPaid: 'Parkir berbayar', parkNone: 'Tidak ada parkir', shareBtn: 'Bagikan ke pelancong', sharing: 'Membagikan…', cancel: 'Batal',
    addToTrip: 'Tambah ke perjalanan', removeFromTrip: 'Hapus dari perjalanan', bookTickets: 'Pesan tiket', gasCashback: 'Cashback BBM', report: 'Laporkan', addedBy: 'Ditambahkan oleh {name}', travellerTip: 'Tips pelancong',
    signInPrompt: 'Masuk untuk menambah tempat — menjaga komunitas tepercaya.', continueGoogle: 'Lanjutkan dengan Google', orSep: 'atau', email: 'Email', password: 'Kata sandi', passwordNew: 'Buat kata sandi', signIn: 'Masuk', createAccount: 'Buat akun', newHere: 'Baru di sini? Buat akun', haveAccount: 'Sudah punya akun? Masuk', signedInAs: 'Masuk sebagai', signOut: 'Keluar',
    offlineSaved: 'Anda offline — menampilkan perjalanan tersimpan.', thanksAdded: 'Terima kasih — tempat Anda kini terlihat oleh semua pelancong.', tryLabel: 'Coba:',
    hintBody: 'Masukkan dari dan ke mana Anda berkendara. Pithop memetakan rute dan menemukan titik pandang, atraksi unik, alam, sejarah, dan makanan di jalan.', language: 'Bahasa', vehicle: 'Kendaraan', veh_car: 'Mobil', veh_truck: 'Truk', veh_motorcycle: 'Motor', veh_bike: 'Sepeda',
  },
  vi: {
    tagline: 'Điểm dừng thú vị, viên ngọc ẩn và những lần nghỉ trên đường',
    fromPh: 'Từ — thành phố, địa chỉ', toPh: 'Đến — thành phố hoặc địa chỉ',
    find: 'Tìm điểm dừng trên đường', drive: 'lái xe', stopsFound: 'Tìm thấy {n} điểm dừng',
    aheadLabel: 'Trên đường: chỉ điểm dừng phía trước', maxDetour: 'Vòng tối đa', timeToSpend: 'Thời gian có',
    visitQuick: 'Nhanh (≤ 15 phút)', visitShort: 'Ngắn (≤ 30 phút)', visit1h: 'Đến 1 giờ', visit2h: 'Đến 2 giờ', visitAny: 'Bất kỳ',
    cat_fun: 'Điểm vui chơi', cat_views: 'Điểm ngắm cảnh', cat_nature: 'Thiên nhiên & công viên', cat_history: 'Lịch sử', cat_museums: 'Bảo tàng & văn hóa', cat_food: 'Ăn uống', cat_rest: 'Trạm dừng nghỉ',
    yourStops: 'Điểm dừng của bạn ({n})', startTrip: 'Bắt đầu trên Google Maps', share: 'Chia sẻ', save: 'Lưu', clear: 'Xóa', savedTrips: 'Chuyến đã lưu',
    addPlace: 'Thêm một địa điểm', addPlaceArmed: 'Chạm vào bản đồ tại vị trí — hoặc hủy ✕', shareTitle: 'Chia sẻ một địa điểm với mọi du khách',
    namePh: 'Tên — vd. Khu picnic ven sông', notePh: 'Điều gì khiến nơi này đáng dừng? (tùy chọn)', parkingQ: 'Bãi đỗ? (tùy chọn)',
    parkFree: 'Đỗ xe miễn phí', parkPaid: 'Đỗ xe trả phí', parkNone: 'Không có chỗ đỗ', shareBtn: 'Chia sẻ với du khách', sharing: 'Đang chia sẻ…', cancel: 'Hủy',
    addToTrip: 'Thêm vào chuyến', removeFromTrip: 'Bỏ khỏi chuyến', bookTickets: 'Đặt vé', gasCashback: 'Hoàn tiền xăng', report: 'Báo cáo', addedBy: 'Được thêm bởi {name}', travellerTip: 'Mẹo du lịch',
    signInPrompt: 'Đăng nhập để thêm địa điểm — giúp cộng đồng đáng tin cậy.', continueGoogle: 'Tiếp tục với Google', orSep: 'hoặc', email: 'Email', password: 'Mật khẩu', passwordNew: 'Tạo mật khẩu', signIn: 'Đăng nhập', createAccount: 'Tạo tài khoản', newHere: 'Mới đến? Tạo tài khoản', haveAccount: 'Đã có tài khoản? Đăng nhập', signedInAs: 'Đăng nhập với tên', signOut: 'Đăng xuất',
    offlineSaved: 'Bạn đang ngoại tuyến — hiển thị chuyến đã lưu.', thanksAdded: 'Cảm ơn — địa điểm của bạn giờ hiển thị với mọi du khách.', tryLabel: 'Thử:',
    hintBody: 'Nhập điểm đi và điểm đến. Pithop vẽ lộ trình và tìm điểm ngắm cảnh, điểm tham quan độc đáo, thiên nhiên, lịch sử và ẩm thực trên đường.', language: 'Ngôn ngữ', vehicle: 'Phương tiện', veh_car: 'Ô tô', veh_truck: 'Xe tải', veh_motorcycle: 'Xe máy', veh_bike: 'Xe đạp',
  },
  zh: {
    tagline: '旅途中的有趣停靠、隐藏景点与休息点',
    fromPh: '出发地 — 城市、地址', toPh: '目的地 — 城市或地址',
    find: '查找沿途停靠点', drive: '车程', stopsFound: '找到 {n} 个停靠点',
    aheadLabel: '在路上：只看前方的停靠点', maxDetour: '最大绕行', timeToSpend: '可用时间',
    visitQuick: '快速停靠（≤ 15 分钟）', visitShort: '短暂（≤ 30 分钟）', visit1h: '最多 1 小时', visit2h: '最多 2 小时', visitAny: '任意时长',
    cat_fun: '景点与娱乐', cat_views: '观景点', cat_nature: '自然与公园', cat_history: '历史', cat_museums: '博物馆与文化', cat_food: '餐饮', cat_rest: '休息区',
    yourStops: '你的停靠点（{n}）', startTrip: '在 Google 地图中开始', share: '分享', save: '保存', clear: '清除', savedTrips: '已保存的行程',
    addPlace: '添加地点', addPlaceArmed: '在地图上点按该地点 — 或取消 ✕', shareTitle: '与所有旅行者分享一个地点',
    namePh: '名称 — 例如 河边野餐区', notePh: '这里为何值得停留？（可选）', parkingQ: '停车？（可选）',
    parkFree: '免费停车', parkPaid: '付费停车', parkNone: '无停车位', shareBtn: '与旅行者分享', sharing: '分享中…', cancel: '取消',
    addToTrip: '加入行程', removeFromTrip: '移出行程', bookTickets: '预订门票', gasCashback: '加油返现', report: '举报', addedBy: '由 {name} 添加', travellerTip: '旅行者提示',
    signInPrompt: '登录后可添加地点 — 让社区更可信。', continueGoogle: '使用 Google 继续', orSep: '或', email: '邮箱', password: '密码', passwordNew: '创建密码', signIn: '登录', createAccount: '创建账户', newHere: '新用户？创建账户', haveAccount: '已有账户？登录', signedInAs: '已登录：', signOut: '退出',
    offlineSaved: '你已离线 — 显示已保存的行程。', thanksAdded: '谢谢 — 你的地点现在对所有旅行者可见。', tryLabel: '试试：',
    hintBody: '输入你的出发地和目的地。Pithop 会规划路线，并找出沿途的观景点、有趣景点、自然、历史与美食。', language: '语言', vehicle: '车辆', veh_car: '汽车', veh_truck: '卡车', veh_motorcycle: '摩托车', veh_bike: '自行车',
  },
  ja: {
    tagline: 'ドライブ途中の楽しい立ち寄り・隠れた名所・休憩',
    fromPh: '出発地 — 都市・住所', toPh: '目的地 — 都市または住所',
    find: '途中の立ち寄りを探す', drive: '運転', stopsFound: '{n} 件の立ち寄りが見つかりました',
    aheadLabel: '走行中：前方の立ち寄りのみ', maxDetour: '最大寄り道', timeToSpend: '使える時間',
    visitQuick: 'さっと（15分以内）', visitShort: '短め（30分以内）', visit1h: '1時間まで', visit2h: '2時間まで', visitAny: '指定なし',
    cat_fun: '観光・遊び', cat_views: '展望スポット', cat_nature: '自然・公園', cat_history: '歴史', cat_museums: '博物館・文化', cat_food: '飲食', cat_rest: '休憩所',
    yourStops: 'あなたの立ち寄り（{n}）', startTrip: 'Google マップで開始', share: '共有', save: '保存', clear: 'クリア', savedTrips: '保存した旅行',
    addPlace: '場所を追加', addPlaceArmed: '場所の位置で地図をタップ — またはキャンセル ✕', shareTitle: 'すべての旅行者と場所を共有',
    namePh: '名称 — 例：川辺のピクニック場', notePh: '立ち寄る価値は？（任意）', parkingQ: '駐車場は？（任意）',
    parkFree: '無料駐車場', parkPaid: '有料駐車場', parkNone: '駐車場なし', shareBtn: '旅行者と共有', sharing: '共有中…', cancel: 'キャンセル',
    addToTrip: '旅行に追加', removeFromTrip: '旅行から削除', bookTickets: 'チケット予約', gasCashback: '給油キャッシュバック', report: '報告', addedBy: '{name} が追加', travellerTip: '旅行者のヒント',
    signInPrompt: '場所を追加するにはサインイン — コミュニティの信頼を保ちます。', continueGoogle: 'Google で続行', orSep: 'または', email: 'メール', password: 'パスワード', passwordNew: 'パスワードを作成', signIn: 'サインイン', createAccount: 'アカウント作成', newHere: '初めて？アカウント作成', haveAccount: 'アカウントあり？サインイン', signedInAs: 'サインイン中：', signOut: 'サインアウト',
    offlineSaved: 'オフラインです — 保存した旅行を表示します。', thanksAdded: 'ありがとうございます — あなたの場所がすべての旅行者に表示されます。', tryLabel: 'お試し：',
    hintBody: '出発地と目的地を入力してください。Pithop がルートを描き、途中の展望スポット、ユニークな名所、自然、歴史、グルメを見つけます。', language: '言語', vehicle: '車両', veh_car: '車', veh_truck: 'トラック', veh_motorcycle: 'バイク', veh_bike: '自転車',
  },
  ko: {
    tagline: '드라이브 중 즐거운 정차, 숨은 명소, 휴식',
    fromPh: '출발 — 도시, 주소', toPh: '도착 — 도시 또는 주소',
    find: '경로 위 정차지 찾기', drive: '주행', stopsFound: '{n}개의 정차지를 찾음',
    aheadLabel: '주행 중: 앞쪽 정차지만', maxDetour: '최대 우회', timeToSpend: '가능한 시간',
    visitQuick: '빠르게 (≤ 15분)', visitShort: '짧게 (≤ 30분)', visit1h: '1시간까지', visit2h: '2시간까지', visitAny: '제한 없음',
    cat_fun: '명소 & 즐길거리', cat_views: '전망 포인트', cat_nature: '자연 & 공원', cat_history: '역사', cat_museums: '박물관 & 문화', cat_food: '음식 & 음료', cat_rest: '휴게소',
    yourStops: '내 정차지 ({n})', startTrip: 'Google 지도에서 시작', share: '공유', save: '저장', clear: '지우기', savedTrips: '저장된 여행',
    addPlace: '장소 추가', addPlaceArmed: '장소 위치를 지도에서 탭 — 또는 취소 ✕', shareTitle: '모든 여행자와 장소 공유',
    namePh: '이름 — 예: 강변 피크닉 장소', notePh: '들를 만한 이유는? (선택)', parkingQ: '주차? (선택)',
    parkFree: '무료 주차', parkPaid: '유료 주차', parkNone: '주차 불가', shareBtn: '여행자와 공유', sharing: '공유 중…', cancel: '취소',
    addToTrip: '여행에 추가', removeFromTrip: '여행에서 제거', bookTickets: '티켓 예약', gasCashback: '주유 캐시백', report: '신고', addedBy: '{name} 님이 추가', travellerTip: '여행자 팁',
    signInPrompt: '장소를 추가하려면 로그인 — 커뮤니티 신뢰를 유지합니다.', continueGoogle: 'Google로 계속', orSep: '또는', email: '이메일', password: '비밀번호', passwordNew: '비밀번호 만들기', signIn: '로그인', createAccount: '계정 만들기', newHere: '처음이세요? 계정 만들기', haveAccount: '계정이 있나요? 로그인', signedInAs: '로그인:', signOut: '로그아웃',
    offlineSaved: '오프라인입니다 — 저장된 여행을 표시합니다.', thanksAdded: '감사합니다 — 장소가 이제 모든 여행자에게 표시됩니다.', tryLabel: '예시:',
    hintBody: '출발지와 도착지를 입력하세요. Pithop가 경로를 그리고 전망 포인트, 독특한 명소, 자연, 역사, 음식을 찾아줍니다.', language: '언어', vehicle: '차량', veh_car: '자동차', veh_truck: '트럭', veh_motorcycle: '오토바이', veh_bike: '자전거',
  },
};

const KEY = 'sq-lang';
let current: Lang = 'en';

const supported = new Set(LANGUAGES.map((l) => l.code));

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && supported.has(saved as Lang)) return saved as Lang;
    for (const l of navigator.languages ?? [navigator.language]) {
      const code = l.toLowerCase().split('-')[0] as Lang;
      if (supported.has(code)) return code;
    }
  } catch {
    // fall through
  }
  return 'en';
}

export function getLang(): Lang {
  return current;
}

export function dirFor(lang: Lang): 'ltr' | 'rtl' {
  return LANGUAGES.find((l) => l.code === lang)?.dir ?? 'ltr';
}

function applyDocument(lang: Lang): void {
  const el = document.documentElement;
  el.lang = lang;
  el.dir = dirFor(lang);
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // storage blocked — choice won't persist
  }
  applyDocument(lang);
}

export function initI18n(): void {
  current = detect();
  applyDocument(current);
}

// Category label by id (keys cat_fun … cat_rest).
export function catLabel(id: string): string {
  return t(('cat_' + id) as TKey);
}

// Translate a key with optional {placeholder} substitution; English fallback.
export function t(key: TKey, vars?: Record<string, string | number>): string {
  const s = dicts[current]?.[key] ?? en[key];
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
