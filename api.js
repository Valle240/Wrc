/**
 * @file api.js
 * @description Servicios de red para la carga de itinerarios, entradas (pilotos) y tiempos.
 */

import { rallyCodes } from './config.js';

export async function fetchItinerario(anio, rally) {
    const codigo = rallyCodes[rally];
    const anioCorto = anio.toString().slice(-2);
    const ruta = `data/${anio}/${rally}/itineraries_${codigo}${anioCorto}.json`;

    const res = await fetch(ruta);
    if (!res.ok) throw new Error("No se encontró el itinerario");
    return await res.json();
}

export async function fetchEntries(anio, rally) {
    const codigo = rallyCodes[rally];
    const anioCorto = anio.toString().slice(-2);
    const ruta = `data/${anio}/${rally}/entries_${codigo}${anioCorto}.json`;
    
    const res = await fetch(ruta);
    return res.ok ? await res.json() : null;
}

export async function fetchTiempos(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Error al cargar tiempos");
    return await res.json();
}

export async function fetchStages(anio, rally) {
    const codigo = rallyCodes[rally];
    const anioCorto = anio.toString().slice(-2);
    const ruta = `data/${anio}/${rally}/stages_${codigo}${anioCorto}.json`;

    const res = await fetch(ruta);
    if (!res.ok) throw new Error("No se encontró la información de etapas");
    return await res.json();
}