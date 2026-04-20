/**
 * @file config.js
 * @description Configuración estática, diccionarios de rallies y opciones de Chart.js.
 */

export const rallyCodes = {
    "montecarlo": "MC",
    "sweden": "SE",
    "kenya": "KE",
    "croatia": "HR",
    "islascanarias": "IC"
};

export const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false,          // Puedes ocultarla si prefieres una lista externa
            position: 'right',     // 'top', 'left', 'right', 'bottom'
            align: 'start',         // Alinea los nombres a la izquierda
            labels: {
                color: '#ff6600',   // Naranja para los nombres de los pilotos
                font: {
                    family: 'monospace', // Estética técnica
                    size: 11
                },
                usePointStyle: true, // Cambia el cuadrado por un círculo
                padding: 20          // Espacio entre los elementos de la leyenda
            }
        },
        tooltip: {
            callbacks: {
                // Formatea el tiempo cuando pasas el ratón sobre un punto
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) label += ': ';
                    const totalSeconds = context.parsed.y;
                    const mins = Math.floor(totalSeconds / 60);
                    const secs = Math.round(totalSeconds % 60);
                    return label + `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                }
            }
        }
    },
    scales: {
        y: {
            ticks: {
                color: '#777777',
                // Formatea los números del eje lateral a MM:SS
                callback: function(value) {
                    const mins = Math.floor(value / 60);
                    const secs = Math.round(value % 60);
                    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                }
            },
            grid: {
                color: '#2a2a2a' // Rejilla sutil para el estilo oscuro
            }
        },
        x: {
            ticks: { color: '#777777' },
            grid: { color: '#2a2a2a' }
        }
    }
};