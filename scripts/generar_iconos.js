/**
 * Genera los íconos PNG de la PWA sin dependencias ni recursos de terceros.
 * Dibuja la marca de ChivoMed (cruz blanca sobre fondo del color de acento) con supermuestreo
 * y codifica el PNG a mano (IHDR, IDAT con zlib, IEND, CRC32).
 *
 *   node scripts/generar_iconos.js        → escribe src/resources/iconos/*.png
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const COLORES = Object.freeze({ fondo: [0x18, 0x7d, 0x68], cruz: [0xff, 0xff, 0xff] });

export const ICONOS = Object.freeze([
    { archivo: 'icono-192.png', tamano: 192, maskable: false },
    { archivo: 'icono-512.png', tamano: 512, maskable: false },
    { archivo: 'icono-maskable-192.png', tamano: 192, maskable: true },
    { archivo: 'icono-maskable-512.png', tamano: 512, maskable: true },
]);

/** Distancia con signo a un rectángulo redondeado centrado en el origen (negativa dentro). */
function rectRedondeado(x, y, mitadAncho, mitadAlto, radio) {
    const qx = Math.abs(x) - mitadAncho + radio;
    const qy = Math.abs(y) - mitadAlto + radio;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radio;
}

/**
 * Cobertura [0..1] de fondo y cruz en un punto normalizado (-1..1).
 * - "any": loseta redondeada que ocupa todo el lienzo, esquinas transparentes.
 * - maskable: fondo a sangre completa y la cruz dentro de la zona segura (círculo de radio 0.8).
 */
function muestra(x, y, maskable) {
    const fondo = maskable ? true : rectRedondeado(x, y, 1, 1, 0.42) <= 0;
    const escala = maskable ? 0.62 : 0.78;
    const brazo = 0.56 * escala;
    const grosor = 0.19 * escala;
    const redondeo = 0.07 * escala;
    const cruz = rectRedondeado(x, y, brazo, grosor, redondeo) <= 0
        || rectRedondeado(x, y, grosor, brazo, redondeo) <= 0;
    return { fondo, cruz: fondo && cruz };
}

/** Devuelve los píxeles RGBA (Uint8Array) del ícono. */
export function dibujarIcono(tamano, maskable, submuestras = 4) {
    const pixeles = new Uint8Array(tamano * tamano * 4);
    const total = submuestras * submuestras;
    for (let py = 0; py < tamano; py++) {
        for (let px = 0; px < tamano; px++) {
            let fondo = 0;
            let cruz = 0;
            for (let sy = 0; sy < submuestras; sy++) {
                for (let sx = 0; sx < submuestras; sx++) {
                    const x = ((px + (sx + 0.5) / submuestras) / tamano) * 2 - 1;
                    const y = ((py + (sy + 0.5) / submuestras) / tamano) * 2 - 1;
                    const m = muestra(x, y, maskable);
                    if (m.fondo) fondo++;
                    if (m.cruz) cruz++;
                }
            }
            const alfa = fondo / total;
            const mezcla = fondo ? cruz / fondo : 0;
            const i = (py * tamano + px) * 4;
            for (let c = 0; c < 3; c++) {
                pixeles[i + c] = Math.round(COLORES.fondo[c] * (1 - mezcla) + COLORES.cruz[c] * mezcla);
            }
            pixeles[i + 3] = Math.round(alfa * 255);
        }
    }
    return pixeles;
}

const TABLA_CRC = (() => {
    const tabla = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        tabla[n] = c >>> 0;
    }
    return tabla;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function bloque(tipo, datos) {
    const cabecera = Buffer.alloc(8);
    cabecera.writeUInt32BE(datos.length, 0);
    cabecera.write(tipo, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([cabecera.subarray(4), datos])), 0);
    return Buffer.concat([cabecera, datos, crc]);
}

/** Codifica RGBA de 8 bits por canal como PNG (filtro 0 en cada fila). */
export function codificarPng(ancho, alto, rgba) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(ancho, 0);
    ihdr.writeUInt32BE(alto, 4);
    ihdr[8] = 8;  // profundidad
    ihdr[9] = 6;  // RGBA
    const filas = Buffer.alloc((ancho * 4 + 1) * alto);
    for (let y = 0; y < alto; y++) {
        filas[y * (ancho * 4 + 1)] = 0;
        Buffer.from(rgba.buffer, rgba.byteOffset + y * ancho * 4, ancho * 4).copy(filas, y * (ancho * 4 + 1) + 1);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        bloque('IHDR', ihdr),
        bloque('IDAT', deflateSync(filas, { level: 9 })),
        bloque('IEND', Buffer.alloc(0)),
    ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const destino = new URL('../src/resources/iconos/', import.meta.url);
    mkdirSync(destino, { recursive: true });
    for (const { archivo, tamano, maskable } of ICONOS) {
        const png = codificarPng(tamano, tamano, dibujarIcono(tamano, maskable));
        writeFileSync(new URL(archivo, destino), png);
        console.log(`${archivo}: ${tamano}x${tamano}, ${png.length} bytes`);
    }
}
