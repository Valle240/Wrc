/**
 * @file ui.js
 * @description Procesamiento de datos de tiempos y renderizado de la gráfica con Chart.js.
 */

import { chartOptions } from './config.js';

let miGrafica;

/**
 * Función principal que orquestra el dibujo de la gráfica
 * @param {Array|Object} tiempos - El JSON de tiempos (splits)
 * @param {Object} tripulaciones - Mapeo de IDs a nombres
 * @param {Array} infoEtapas - El JSON de stages_MC26.json (con las distancias)
 */
export function renderizarGrafica(tiempos, tripulaciones, infoEtapas) {
    const datos = tiempos.splitTimes || tiempos;
    
    if (!datos || datos.length === 0) {
        console.error("No se encontraron datos de tiempos válidos.");
        return;
    }

    // 1. Identificar la etapa buscando qué etapa contiene los splits que tenemos
    const primerSplitId = datos[0].splitPointId;

    // Buscamos en infoEtapas cuál de ellas tiene este splitPointId en su lista
    const infoDeEstaEtapa = infoEtapas.find(etapa => 
        etapa.splitPoints && etapa.splitPoints.some(sp => sp.splitPointId === primerSplitId)
    );

    // 2. Ahora mapaDistancias SÍ se llenará porque infoDeEstaEtapa ya no es undefined
    const mapaDistancias = {};
    if (infoDeEstaEtapa && infoDeEstaEtapa.splitPoints) {
        infoDeEstaEtapa.splitPoints.forEach(sp => {
            mapaDistancias[String(sp.splitPointId)] = sp.distance;
        });
    }

    // 3. Obtener los splitPointId únicos de los tiempos y ORDENARLOS POR DISTANCIA (KM)
    const splitIdsUnicos = [...new Set(datos.map(d => d.splitPointId).filter(Boolean))]
        .sort((a, b) => (mapaDistancias[a] || 0) - (mapaDistancias[b] || 0));

    // 4. Procesar los datos de los pilotos
    const pilotos = agruparPorPiloto(datos);
    const pilotosArray = Object.values(pilotos);
    
    // Generamos las etiquetas del Eje X usando los kilómetros
    const labels = generarLabels(splitIdsUnicos, mapaDistancias, infoDeEstaEtapa);
    const datasets = crearDatasets(pilotosArray, tripulaciones, splitIdsUnicos);

    // 5. Renderizar en el Canvas
    const ctx = document.getElementById('miGrafica').getContext('2d');
    
    if (miGrafica) {
        miGrafica.destroy(); 
    }

    miGrafica = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: chartOptions
    });
    
    // GENERAR LEYENDA HTML
    generarLeyendaHTML(datasets);
}

function generarLeyendaHTML(datasets) {
    const legendContainer = document.getElementById('custom-legend');
    legendContainer.innerHTML = ''; 

    // El primer dataset en el array es el más rápido (referencia)
    const tiempoReferencia = datasets[0].data[datasets[0].data.length - 1];

    // Crear encabezado de la tabla
    const header = document.createElement('div');
    header.className = 'legend-header';
    header.innerHTML = `<span>Piloto</span><span>Tiempo</span><span>Diff</span>`;
    legendContainer.appendChild(header);

    datasets.forEach((dataset, index) => {
        const ultimoTiempo = dataset.data[dataset.data.length - 1];
        
        const item = document.createElement('div');
        item.className = 'legend-item';
        if (dataset.hidden) item.classList.add('hidden');
        item.style.borderLeftColor = dataset.borderColor;

        // Formatear Tiempo Total (MM:SS.s)
        const mins = Math.floor(ultimoTiempo / 60);
        const secs = (ultimoTiempo % 60).toFixed(1);
        const tiempoTxt = ultimoTiempo ? `${mins}:${secs < 10 ? '0' : ''}${secs}` : 'DNF';

        // Calcular Diferencia
        let diffTxt = index === 0 ? "—" : "N/A";
        if (index > 0 && ultimoTiempo && tiempoReferencia) {
            diffTxt = `+${(ultimoTiempo - tiempoReferencia).toFixed(1)}s`;
        }

        item.innerHTML = `
            <div class="pilot-info">
                <span class="legend-color-box" style="background-color: ${dataset.borderColor}"></span>
                <span class="pilot-name">${dataset.label}</span>
            </div>
            <span class="pilot-time">${tiempoTxt}</span>
            <span class="pilot-diff">${diffTxt}</span>
        `;

        item.onclick = () => {
            const isVisible = miGrafica.isDatasetVisible(index);
            miGrafica.setDatasetVisibility(index, !isVisible);
            miGrafica.update();
            item.classList.toggle('hidden');
        };

        legendContainer.appendChild(item);
    });
}


/**
 * Agrupa los registros de splits por el ID del piloto (entryId)
 */
function agruparPorPiloto(tiempos) {
    const pilotos = {};
    tiempos.forEach(s => {
        const id = s.entryId.toString();
        if (!pilotos[id]) {
            pilotos[id] = { 
                entryId: id, 
                stageTimeDurationMs: null, 
                splitTimes: {} 
            };
        }
        
        // Guardamos cada tiempo de split usando su ID como clave
        if (s.elapsedDurationMs && s.splitPointId) {
            pilotos[id].splitTimes[s.splitPointId] = s.elapsedDurationMs;
        }
        
        // Guardamos el tiempo de meta
        if (s.stageTimeDurationMs) {
            pilotos[id].stageTimeDurationMs = s.stageTimeDurationMs;
        }
    });
    return pilotos;
}

/**
 * Genera los nombres del Eje X mostrando los Kilómetros reales
 */
function generarLabels(splitIdsUnicos, mapaDistancias, infoDeEstaEtapa) {
    const labels = ["Salida (0 km)"];
    
    // Iteramos sobre los IDs ya ordenados por distancia
    splitIdsUnicos.forEach(id => {
        const km = mapaDistancias[id];
        if (km !== undefined) {
            labels.push(`KM ${km}`);
        } else {
            labels.push(`Split ${id}`); // Fallback por si falta en el JSON de etapas
        }
    });

    // Para la meta, usamos la distancia total de la etapa si existe en el JSON
    if (infoDeEstaEtapa && infoDeEstaEtapa.distance) {
        labels.push(`Meta (${infoDeEstaEtapa.distance} km)`);
    } else {
        labels.push("Meta");
    }
    
    return labels;
}

/**
 * Transforma los datos en el formato de Chart.js ordenados por el tiempo total del tramo.
 */
function crearDatasets(pilotosArray, tripulaciones, splitIdsUnicos) {
    // 1. Ordenamos el array: los más rápidos primero, los que no terminaron al final
    const pilotosOrdenados = [...pilotosArray].sort((a, b) => {
        // Si ambos terminaron el tramo, comparamos sus tiempos totales
        if (a.stageTimeDurationMs && b.stageTimeDurationMs) {
            return a.stageTimeDurationMs - b.stageTimeDurationMs;
        }
        // Si 'a' no terminó (es null), lo mandamos al final (1)
        if (!a.stageTimeDurationMs) return 1;
        // Si 'b' no terminó, 'a' va antes (-1)
        if (!b.stageTimeDurationMs) return -1;
        return 0;
    });

    // 2. Mapeamos sobre el array ya ordenado
    return pilotosOrdenados.map((p, i) => {
        // Mapeamos los tiempos en el orden exacto de las distancias
        const tiemposSplits = splitIdsUnicos.map(splitId => {
            const tiempo = p.splitTimes[splitId];
            return tiempo ? tiempo / 1000 : null; 
        });

        const pts = [
            0, 
            ...tiemposSplits, 
            p.stageTimeDurationMs ? p.stageTimeDurationMs / 1000 : null
        ];
        
        // El color (hue) ahora dependerá de su posición en la clasificación del tramo
        const hue = (i * 137.5) % 360; 

        return {
            label: tripulaciones[p.entryId] || `ID: ${p.entryId}`,
            data: pts,
            borderColor: `hsl(${hue}, 70%, 50%)`,
            backgroundColor: `hsl(${hue}, 70%, 50%, 0.1)`,
            tension: 0.1,
            spanGaps: true, 
            hidden: i >= 10 // Solo mostramos los 10 más rápidos inicialmente
        };
    });
}

// Añade esto al final de ui.js para poder exportar la instancia actual
export function getInstanciaGrafica() {
    return miGrafica;
}