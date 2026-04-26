/**
 * @file ui.js
 * @description Procesamiento de datos de tiempos y renderizado de la gráfica con Chart.js.
 */

import { chartOptions } from './config.js';

let miGrafica;
// Añade estas para que la leyenda pueda "recordar" qué tramo hay cargado
let ultimoSplitIds = [];
let ultimoMapaDistancias = {};
let ultimaInfoEtapa = null;

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

    // GUARDAMOS LOS DATOS EN LAS VARIABLES QUE ACABAMOS DE CREAR
    ultimoSplitIds = splitIdsUnicos;
    ultimoMapaDistancias = mapaDistancias;
    ultimaInfoEtapa = infoDeEstaEtapa;

    // Pasamos pilotosArray y tripulaciones para la carga inicial
    generarTablaVelocidades(pilotosArray, tripulaciones, ultimoSplitIds, ultimoMapaDistancias, ultimaInfoEtapa);
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

            actualizarVisibilidadTabla();
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

/*
function generarTablaVelocidades(pilotos, tripulaciones, splitIds, mapaDistancias, etapaInfo) {
    const headerRow = document.getElementById('avgSpeedHeader');
    const body = document.getElementById('avgSpeedBody');
    // Buscamos o creamos el contenedor de la leyenda
    let legendDiv = document.getElementById('speedTableLegend');
    
    if (!headerRow || !body || !miGrafica) return; 

    // 1. Generar Encabezados
    headerRow.innerHTML = '<th>Driver</th>';
    const distancias = [0]; 
    splitIds.forEach((id, index) => {
        const km = mapaDistancias[id] || 0;
        distancias.push(km);
        headerRow.innerHTML += `<th>Split ${index + 1} <br><small>${km}km</small></th>`;
    });
    
    if (etapaInfo && etapaInfo.distance) {
        distancias.push(etapaInfo.distance);
        headerRow.innerHTML += `<th>Finish <br><small>${etapaInfo.distance}km</small></th>`;
    }

    body.innerHTML = '';

    // --- PASO 2: PRE-CALCULAR Y FILTRAR ANOMALÍAS (OUTLIERS) ---
    const matrixVelocidades = []; 
    const statsPorSplit = []; 
    const velocidadesValidasPorSplit = []; // Almacén para analizar la media

    for (let i = 1; i < distancias.length; i++) {
        velocidadesValidasPorSplit[i] = [];
    }

    miGrafica.data.datasets.forEach((dataset, index) => {
        matrixVelocidades[index] = [];
        if (!miGrafica.isDatasetVisible(index)) return; 

        const tiempos = dataset.data; 

        for (let i = 1; i < tiempos.length; i++) {
            const dDelta = distancias[i] - distancias[i-1];
            const tActual = tiempos[i];
            const tAnterior = tiempos[i-1];

            if (tActual === null || tAnterior === null) {
                matrixVelocidades[index][i] = null;
                continue;
            }

            const tDelta = tActual - tAnterior;

            if (tDelta > 0 && dDelta > 0) {
                const avgSpeedVal = dDelta / (tDelta / 3600); 
                
                if (avgSpeedVal > 220) {
                    matrixVelocidades[index][i] = 'ERR_MAX';
                } else {
                    matrixVelocidades[index][i] = avgSpeedVal;
                    velocidadesValidasPorSplit[i].push(avgSpeedVal);
                }
            } else {
                matrixVelocidades[index][i] = 'ERR';
            }
        }
    });

    // Calcular el Rango Competitivo ignorando a los que tuvieron problemas
    for (let i = 1; i < distancias.length; i++) {
        const velocidades = velocidadesValidasPorSplit[i];
        if (velocidades.length > 0) {
            const maxSpeed = Math.max(...velocidades);
            // UMBRAL: Si vas a menos del 0.XX% de la velocidad del líder, tuviste un problema
            const umbralAnomalia = maxSpeed * 0.30; 
            
            // Filtramos a los accidentados para no arruinar el gradiente
            const velocidadesCompetitivas = velocidades.filter(v => v >= umbralAnomalia);
            const minCompetitivo = velocidadesCompetitivas.length > 0 ? Math.min(...velocidadesCompetitivas) : maxSpeed;

            statsPorSplit[i] = { 
                max: maxSpeed, 
                min: minCompetitivo,
                umbral: umbralAnomalia 
            };
        } else {
            statsPorSplit[i] = { max: 100, min: 0, umbral: 0 };
        }
    }

    // --- PASO 3: DIBUJAR LA TABLA ---
    miGrafica.data.datasets.forEach((dataset, index) => {
        if (!miGrafica.isDatasetVisible(index)) return;

        const row = document.createElement('tr');
        row.style.borderLeft = `3px solid ${dataset.borderColor}`;
        
        let html = `<td><small>${dataset.label}</small></td>`;

        for (let i = 1; i < distancias.length; i++) {
            const val = matrixVelocidades[index][i];
            const stats = statsPorSplit[i];

            if (val === null || val === undefined) {
                html += `<td style="color: #555; font-style: italic;" title="Missing Split Data">NaN</td>`;
            } else if (val === 'ERR_MAX') {
                html += `<td style="color: #ff4444; font-weight: bold;" title="Impossible Speed (>220km/h)">ERR*</td>`;
            } else if (val === 'ERR') {
                html += `<td style="color: #ffaa00;" title="Time or Distance Error">ERR</td>`;
            } else {
                // APLICAR GRADIENTE O MARCAR COMO ANOMALÍA
                if (val < stats.umbral) {
                    // Outlier: El piloto tuvo un problema grave en este sector
                    html += `<td style="color: #999999; font-style: italic;" title="Major Time Loss Detected">${val.toFixed(1)}*</td>`;
                } else {
                    // Gradiente competitivo
                    let hue = 60; 
                    if (stats.max > stats.min) {
                        const ratio = (val - stats.min) / (stats.max - stats.min);
                        hue = ratio * 120; // De 0 (Rojo) a 120 (Verde)
                    }
                    html += `<td style="color: hsl(${hue}, 100%, 60%); font-weight: bold;">${val.toFixed(1)}</td>`;
                }
            }
        }
        row.innerHTML = html;
        body.appendChild(row);
    });

    // --- PASO 4: INYECTAR LA MINI-LEYENDA ---
    // Buscamos la tabla para meter la leyenda justo debajo
    const tableWrapper = document.querySelector('.table-wrapper') || body.parentElement;
    
    if (!legendDiv) {
        legendDiv = document.createElement('div');
        legendDiv.id = 'speedTableLegend';
        tableWrapper.appendChild(legendDiv);
    }
    
    // --- PASO 4: LEYENDA DINÁMICA CON BARRA DE GRADIENTE ---

    // Calculamos valores reales para los tooltips de la leyenda
    const todasLasVelocidades = statsPorSplit.filter(s => s).map(s => s.max);
    const todasLasMinimas = statsPorSplit.filter(s => s).map(s => s.min);

    const maxAbsoluta = todasLasVelocidades.length > 0 ? Math.max(...todasLasVelocidades).toFixed(1) : "0";
    const minAbsoluta = todasLasMinimas.length > 0 ? Math.min(...todasLasMinimas).toFixed(1) : "0";
    const avgTramo = todasLasVelocidades.length > 0 ? (todasLasVelocidades.reduce((a, b) => a + b, 0) / todasLasVelocidades.length).toFixed(1) : "0";

    legendDiv.innerHTML = `
        <div style="margin-top: 20px; border-top: 1px dashed #333; padding-top: 15px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <span style="font-size: 0.7rem; color: #00ff00; font-weight: bold; text-transform: uppercase;">Fast</span>
                
                <div style="flex-grow: 1; height: 8px; border-radius: 4px; background: linear-gradient(to right, #00ff00, #ffff00, #ff0000);"></div>
                
                <span style="font-size: 0.7rem; color: #ff4444; font-weight: bold; text-transform: uppercase;">Slow</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: #888; white-space: nowrap;">
                
                <div style="display: flex; gap: 12px;">
                    <span><b style="color: #999; font-style: italic;">Val*</b> Possible Issue</span>
                    <span><b style="color: #ffaa00">ERR</b> Data Error</span>
                    <span><b style="color: #ff4444">ERR*</b> Invalid (>220km/h)</span>
                </div>

                <div style="display: flex; gap: 12px; border-left: 1px solid #333; padding-left: 12px;">
                    <span>Max Sector: <b style="color: #eee;">${maxAbsoluta} km/h</b></span>
                    <span>Avg Pace: <b style="color: #eee;">${avgTramo} km/h</b></span>
                    <span>Min Sector: <b style="color: #eee;">${minAbsoluta} km/h</b></span>
                </div>
                
            </div>
        </div>
    `;

    container.innerHTML += `
        <div class="analysis-footer" style="display: flex; justify-content: space-between; margin-top: 15px; color: #777;">
            <div class="tech-note" style="width: 30%;">
                <span style="color: var(--accent-orange);">Val*</span>: Indica anomalías (pinchazos o salidas).
            </div>
            <div class="tech-note" style="width: 30%;">
                <span style="color: #eee;">Max Sector</span>: Velocidad media absoluta más alta registrada.
            </div>
            <div class="tech-note" style="width: 30%;">
                <span style="color: #eee;">Avg Pace</span>: Ritmo medio de los tiempos "scratch" del tramo.
            </div>
        </div>
    `;
}
*/

function generarTablaVelocidades(pilotos, tripulaciones, splitIds, mapaDistancias, etapaInfo) {
    const headerRow = document.getElementById('avgSpeedHeader');
    const body = document.getElementById('avgSpeedBody');
    // Buscamos o creamos el contenedor de la leyenda
    let legendDiv = document.getElementById('speedTableLegend');
    
    if (!headerRow || !body || !miGrafica) return; 

    // 1. Generar Encabezados
    headerRow.innerHTML = '<th>Driver</th>';
    const distancias = [0]; 
    splitIds.forEach((id, index) => {
        const km = mapaDistancias[id] || 0;
        distancias.push(km);
        headerRow.innerHTML += `<th>Split ${index + 1} <br><small>${km}km</small></th>`;
    });
    
    if (etapaInfo && etapaInfo.distance) {
        distancias.push(etapaInfo.distance);
        headerRow.innerHTML += `<th>Finish <br><small>${etapaInfo.distance}km</small></th>`;
    }

    body.innerHTML = '';

    // --- PASO 2: PRE-CALCULAR Y FILTRAR ANOMALÍAS (OUTLIERS) ---
    const matrixVelocidades = []; 
    const statsPorSplit = []; 
    const velocidadesValidasPorSplit = []; 

    for (let i = 1; i < distancias.length; i++) {
        velocidadesValidasPorSplit[i] = [];
    }

    miGrafica.data.datasets.forEach((dataset, index) => {
        matrixVelocidades[index] = [];
        if (!miGrafica.isDatasetVisible(index)) return; 

        const tiempos = dataset.data; 

        for (let i = 1; i < tiempos.length; i++) {
            const dDelta = distancias[i] - distancias[i-1];
            const tActual = tiempos[i];
            const tAnterior = tiempos[i-1];

            if (tActual === null || tAnterior === null) {
                matrixVelocidades[index][i] = null;
                continue;
            }

            const tDelta = tActual - tAnterior;

            if (tDelta > 0 && dDelta > 0) {
                const avgSpeedVal = dDelta / (tDelta / 3600); 
                
                if (avgSpeedVal > 220) {
                    matrixVelocidades[index][i] = 'ERR_MAX';
                } else {
                    matrixVelocidades[index][i] = avgSpeedVal;
                    velocidadesValidasPorSplit[i].push(avgSpeedVal);
                }
            } else {
                matrixVelocidades[index][i] = 'ERR';
            }
        }
    });

    for (let i = 1; i < distancias.length; i++) {
        const velocidades = velocidadesValidasPorSplit[i];
        if (velocidades.length > 0) {
            const maxSpeed = Math.max(...velocidades);
            const umbralAnomalia = maxSpeed * 0.30; 
            
            const velocidadesCompetitivas = velocidades.filter(v => v >= umbralAnomalia);
            const minCompetitivo = velocidadesCompetitivas.length > 0 ? Math.min(...velocidadesCompetitivas) : maxSpeed;

            statsPorSplit[i] = { 
                max: maxSpeed, 
                min: minCompetitivo,
                umbral: umbralAnomalia 
            };
        } else {
            statsPorSplit[i] = { max: 100, min: 0, umbral: 0 };
        }
    }

    // --- PASO 3: DIBUJAR LA TABLA ---
    miGrafica.data.datasets.forEach((dataset, index) => {
        if (!miGrafica.isDatasetVisible(index)) return;

        const row = document.createElement('tr');
        row.style.borderLeft = `3px solid ${dataset.borderColor}`;
        
        let html = `<td><small>${dataset.label}</small></td>`;

        for (let i = 1; i < distancias.length; i++) {
            const val = matrixVelocidades[index][i];
            const stats = statsPorSplit[i];

            if (val === null || val === undefined) {
                html += `<td style="color: #555; font-style: italic;" title="Missing Split Data">NaN</td>`;
            } else if (val === 'ERR_MAX') {
                html += `<td style="color: #ff4444; font-weight: bold;" title="Impossible Speed (>220km/h)">ERR*</td>`;
            } else if (val === 'ERR') {
                html += `<td style="color: #ffaa00;" title="Time or Distance Error">ERR</td>`;
            } else {
                if (val < stats.umbral) {
                    html += `<td style="color: #999999; font-style: italic;" title="Major Time Loss Detected">${val.toFixed(1)}*</td>`;
                } else {
                    let hue = 60; 
                    if (stats.max > stats.min) {
                        const ratio = (val - stats.min) / (stats.max - stats.min);
                        hue = ratio * 120; 
                    }
                    html += `<td style="color: hsl(${hue}, 100%, 60%); font-weight: bold;">${val.toFixed(1)}</td>`;
                }
            }
        }
        row.innerHTML = html;
        body.appendChild(row);
    });

    // --- PASO 4: INYECTAR LA MINI-LEYENDA ---
    const tableWrapper = document.querySelector('.table-wrapper') || body.parentElement;
    
    if (!legendDiv) {
        legendDiv = document.createElement('div');
        legendDiv.id = 'speedTableLegend';
        tableWrapper.appendChild(legendDiv);
    }
    
    const todasLasVelocidades = statsPorSplit.filter(s => s).map(s => s.max);
    const todasLasMinimas = statsPorSplit.filter(s => s).map(s => s.min);

    const maxAbsoluta = todasLasVelocidades.length > 0 ? Math.max(...todasLasVelocidades).toFixed(1) : "0";
    const minAbsoluta = todasLasMinimas.length > 0 ? Math.min(...todasLasMinimas).toFixed(1) : "0";
    const avgTramo = todasLasVelocidades.length > 0 ? (todasLasVelocidades.reduce((a, b) => a + b, 0) / todasLasVelocidades.length).toFixed(1) : "0";

    // Hemos mantenido tu estructura HTML añadiendo las clases "analysis-footer" y "tech-note" 
    // para que el CSS responsive que hicimos pueda actuar.
    legendDiv.innerHTML = `
        <div style="margin-top: 20px; border-top: 1px dashed #333; padding-top: 15px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <span style="font-size: 0.7rem; color: #00ff00; font-weight: bold; text-transform: uppercase;">Fast</span>
                <div style="flex-grow: 1; height: 8px; border-radius: 4px; background: linear-gradient(to right, #00ff00, #ffff00, #ff0000);"></div>
                <span style="font-size: 0.7rem; color: #ff4444; font-weight: bold; text-transform: uppercase;">Slow</span>
            </div>

            <div class="analysis-footer" style="display: flex; justify-content: space-between; align-items: flex-start; font-size: 0.7rem; color: #888;">
                
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <span><b style="color: #999; font-style: italic;">Val*</b> Possible Issue</span>
                    <span><b style="color: #ffaa00">ERR</b> Data Error</span>
                    <span><b style="color: #ff4444">ERR*</b> Invalid (>220km/h)</span>
                </div>

                <div style="display: flex; gap: 12px; border-left: 1px solid #333; padding-left: 12px; flex-wrap: wrap;">
                    <span>Max Sector: <b style="color: #eee;">${maxAbsoluta} km/h</b></span>
                    <span>Avg Pace: <b style="color: #eee;">${avgTramo} km/h</b></span>
                    <span>Min Sector: <b style="color: #eee;">${minAbsoluta} km/h</b></span>
                </div>
            </div>
        </div>
    `;
    /* NOTAS TÉCNICAS SOBRE LOS VALORES MOSTRADOS:
    
    - Val*: Indica anomalías (pinchazos, salidas, etc.). Se activa automáticamente 
            si el piloto se sale de la media del sector por más del porcentaje seleccionado.
            
    - Max Sector: Velocidad del coche más rápido en la zona más veloz. 
                    Representa la máxima velocidad media absoluta registrada entre todos los splits.
                    
    - Avg Pace: Velocidad media de "cabeza" de todo el recorrido. 
                Es el promedio de las velocidades más rápidas de cada split, una estimación de la velocidad promedio perfecta para el tramo.
                
    - Min Sector: Velocidad del coche más lento en la zona más trabada. 
                    Define el suelo de la competición, desestimando todos los valores que tienen asterisco.
    */
}

function actualizarVisibilidadTabla() {
    // Recuperamos los pilotos del dataset de la gráfica para mantener el orden y estado
    const pilotosParaTabla = miGrafica.data.datasets.map((ds, index) => {
        return {
            label: ds.label,
            tiempos: ds.data,
            visible: miGrafica.isDatasetVisible(index),
            color: ds.borderColor
        };
    });

    generarTablaVelocidades(null, null, ultimoSplitIds, ultimoMapaDistancias, ultimaInfoEtapa);
}