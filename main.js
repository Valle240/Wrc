/**
 * @file main.js
 * @description Orquestador principal. Gestiona eventos de usuario y flujo de datos entre módulos.
 */

import * as api from './api.js';
import * as ui from './ui.js';
import { rallyCodes } from './config.js';

// 1. CAPTURA DE ELEMENTOS DEL DOM
const yearSelect = document.getElementById('yearSelect');
const rallySelect = document.getElementById('rallySelect');
const tramoSelect = document.getElementById('tramoSelect');
const rallyLogoImg = document.getElementById('rally-logo');

// 2. ESTADO DE LA APLICACIÓN
let tripulacionesGlobal = {};
let dbWRC = {}; 

// 3. EVENTOS

// Cambio de Año: Llena el select de Rallies
yearSelect.addEventListener('change', () => {
    rallySelect.innerHTML = '<option value="">-- Selecciona Rally --</option>';
    Object.keys(rallyCodes).forEach(r => {
        let opt = document.createElement('option'); 
        opt.value = r; 
        opt.textContent = r.toUpperCase();
        rallySelect.appendChild(opt);
    });
    rallySelect.disabled = false;
    // Reset de tramos
    tramoSelect.innerHTML = '<option value="">-- Selecciona Tramo --</option>';
    tramoSelect.disabled = true;

    // Ocultar logo si se cambia el año (hasta elegir nuevo rally)
    rallyLogoImg.style.display = 'none';
    rallyLogoImg.src = '';
});


// Cambio de Rally: Carga itinerario, pilotos y logo
rallySelect.addEventListener('change', async () => {
    const year = yearSelect.value;
    const rally = rallySelect.value;
    
    if (!year || !rally) return;

    const codigo = rallyCodes[rally];
    const anioCorto = year.slice(-2);

    // 1. Definimos las dos rutas posibles
    const rutaEspecifica = `data/${year}/${rally}/logo_${codigo}${anioCorto}.png`;
    const rutaGenerica = `data/logos/logo_${codigo}.png`;

    // 2. Intentamos cargar primero la específica
    rallyLogoImg.src = rutaEspecifica;
    rallyLogoImg.style.display = 'block';

    // 3. Lógica de error en cascada
    rallyLogoImg.onerror = () => {
        // Si ya estamos probando la genérica y vuelve a fallar, ocultamos todo
        if (rallyLogoImg.src.includes(rutaGenerica)) {
            console.warn(`Ni logo específico ni genérico encontrado para: ${rally}`);
            rallyLogoImg.style.display = 'none';
        } else {
            // Si falló la específica, intentamos con la genérica
            console.log(`Buscando logo genérico para ${rally}...`);
            rallyLogoImg.src = rutaGenerica;
        }
    };

    tramoSelect.innerHTML = '<option>Cargando...</option>';
    
    try {
        // 1. Cargar Pilotos
        const entriesData = await api.fetchEntries(year, rally);
        tripulacionesGlobal = {}; 
        
        if (entriesData) {
            // ACTUALIZAMOS EL SELECTOR AQUÍ
            ui.actualizarSelectorCategorias(entriesData); 

            entriesData.forEach(entry => {
                // CAMBIO CLAVE: Guardamos el objeto entero, no solo el string del nombre
                tripulacionesGlobal[entry.entryId.toString()] = entry; 
            });
        }

        // 2. Cargar Itinerario
        const itineraryData = await api.fetchItinerario(year, rally);
        
        // Reset de la base de datos local
        if (!dbWRC[year]) dbWRC[year] = {};
        dbWRC[year][rally] = [];

        const codigo = rallyCodes[rally];
        const anioCorto = year.slice(-2);

        itineraryData.itineraryLegs.forEach(leg => {
            leg.itinerarySections.forEach(section => {
                section.stages.forEach(stage => {
                    if (stage.number && stage.stageType !== "ServiceTransport") {
                        const archivoSplits = `splittimes_ss${stage.number}_${codigo}${anioCorto}.json`;
                        dbWRC[year][rally].push({
                            nombre: `SS${stage.number} ${stage.name} - ${stage.distance}km`,
                            archivo: `data/${year}/${rally}/${archivoSplits}`
                        });
                    }
                });
            });
        });

        // 3. Llenar el select con los datos procesados
        llenarSelectTramos(year, rally);

    } catch (err) {
        console.warn("Aviso:", err.message);
        // AQUÍ ESTÁ EL CAMBIO: Si falla el fetch, mostramos que no hay datos
        tramoSelect.innerHTML = '<option value="">No hay datos disponibles</option>';
        tramoSelect.disabled = true;
    }
});

////////////////////////////////////////////////////////////////////
// Los tiempos de los tramos son el tiempo acumulado desde el inicio del tramo, no el tiempo entre split y split, AUNQUE en algunos .json hay errores de conometraje y el tiempo en meta es menor al uno de los anteriores splits.
////////////////////////////////////////////////////////////////////
tramoSelect.addEventListener('change', async (e) => {
    if (!e.target.value) return;

    try {
        const year = yearSelect.value;
        const rally = rallySelect.value;

        // 1. Cargamos los tiempos (splits)
        const tiempos = await api.fetchTiempos(e.target.value);
        
        // 2. Cargamos el JSON de las etapas (PASAMOS year y rally originales)
        const infoEtapas = await api.fetchStages(year, rally); 

        // 3. Renderizamos
        ui.renderizarGrafica(tiempos, tripulacionesGlobal, infoEtapas);

    } catch (err) {
        console.error(err);
        alert("Error al cargar los datos del tramo");
    }
});

// 4. FUNCIONES AUXILIARES
function llenarSelectTramos(year, rally) {
    tramoSelect.innerHTML = '';
    const tramos = dbWRC[year][rally];

    if (tramos && tramos.length > 0) {
        let optDefault = document.createElement('option');
        optDefault.value = '';
        optDefault.textContent = '-- Selecciona Tramo --';
        tramoSelect.appendChild(optDefault);

        tramos.forEach(t => {
            let opt = document.createElement('option');
            opt.value = t.archivo;
            opt.textContent = t.nombre;
            tramoSelect.appendChild(opt);
        });
        tramoSelect.disabled = false;
    } else {
        let optNoData = document.createElement('option');
        optNoData.textContent = 'No hay datos disponibles';
        tramoSelect.appendChild(optNoData);
        tramoSelect.disabled = true;
    }
}

// --- LÓGICA DEL MODAL AVANZADA ---
const expandBtn = document.getElementById('expandChart');
const chartModal = document.getElementById('chartModal');
const modalCanvas = document.getElementById('modalChart');
let modalChartInstance = null;

// Función para cerrar el modal de forma limpia
const cerrarModal = () => {
    chartModal.classList.remove('active');
    // Esperamos a que termine la animación de salida para destruir la gráfica
    setTimeout(() => {
        if (modalChartInstance) {
            modalChartInstance.destroy();
            modalChartInstance = null;
        }
    }, 400); 
};

// Evento para el botón (Abrir / Cerrar)
expandBtn.addEventListener('click', () => {
    // Si ya está activo, lo cerramos
    if (chartModal.classList.contains('active')) {
        cerrarModal();
        expandBtn.classList.remove('boton-activo');
        return;
    }

    // 1. Usamos tu función exportada para obtener la instancia real
    const mainChart = ui.getInstanciaGrafica(); 
    
    if (mainChart && mainChart.data.datasets.length > 0) {
        chartModal.classList.add('active');
        expandBtn.classList.add('boton-activo');

        // 2. SINCRONIZACIÓN CLAVE: 
        // Actualizamos la propiedad 'hidden' de cada dataset para que 
        // coincida exactamente con lo que el usuario está viendo ahora mismo.
        mainChart.data.datasets.forEach((dataset, index) => {
            dataset.hidden = !mainChart.isDatasetVisible(index);
        });

        setTimeout(() => {
            if (modalChartInstance) modalChartInstance.destroy();

            const configOriginal = mainChart.config._config;

            // 3. Creamos el clon en el modal
            modalChartInstance = new Chart(modalCanvas, {
                type: 'line',
                // Hacemos una copia profunda de los datos para evitar que 
                // las dos gráficas se peleen por el mismo objeto en memoria
                data: JSON.parse(JSON.stringify(mainChart.data)), 
                options: {
                    ...configOriginal.options,
                    maintainAspectRatio: false,
                    responsive: true,
                    animation: { duration: 400 }
                }
            });
        }, 150);
    }
});

// Cerrar con la tecla ESC
document.addEventListener('keydown', (e) => {
    if (e.key === "Escape" && chartModal.classList.contains('active')) {
        cerrarModal();
        expandBtn.classList.remove('boton-activo');
    }
});

// Cerrar al hacer clic fuera (en el fondo oscuro)
chartModal.addEventListener('click', (e) => {
    if (e.target === chartModal) {
        cerrarModal();
        expandBtn.classList.remove('boton-activo');
    }
});


// Busca y reemplaza el listener de 'groupFilter' por este:
// Busca el antiguo listener de 'groupFilter' y cámbialo por este:
const groupBtns = document.getElementById('groupFilterButtons');
groupBtns.addEventListener('categoryChange', (e) => {
    const selectedGroup = e.detail; // El valor viene en e.detail
    const chart = ui.getInstanciaGrafica();
    if (!chart) return;

    let contadorVisibles = 0;
    chart.data.datasets.forEach((ds, index) => {
        const perteneceAlGrupo = (selectedGroup === "All" || ds.group === selectedGroup);
        if (perteneceAlGrupo && contadorVisibles < 10) {
            chart.setDatasetVisibility(index, true);
            contadorVisibles++;
        } else {
            chart.setDatasetVisibility(index, false);
        }
    });

    chart.update();
    ui.generarLeyendaHTML(chart.data.datasets); // Actualizar la leyenda que está debajo
    ui.actualizarVisibilidadTabla();
});