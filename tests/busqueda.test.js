import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizarTexto,
    obtenerPropiedadPorRuta,
    coincideTexto,
    extraerTextos,
    filtrarColeccion,
    crearBuscadorDebounce,
    escaparHtml,
    resaltarCoincidencias
} from '../src/js/control/busqueda_util.js';

describe('Módulo busqueda_util (Pruebas Unitarias)', () => {

    describe('normalizarTexto()', () => {
        test('elimina mayúsculas y espacios sobrantes', () => {
            assert.equal(normalizarTexto('   HOLA    MUNDO   '), 'hola mundo');
        });

        test('elimina tildes y diacríticos en español', () => {
            assert.equal(normalizarTexto('Atención Médica en Clínica San José'), 'atencion medica en clinica san jose');
            assert.equal(normalizarTexto('ÚLCERA ÓSEO ÍNDICE ÉXITO ÁRBOL'), 'ulcera oseo indice exito arbol');
        });

        test('tolera valores nulos, indefinidos y números', () => {
            assert.equal(normalizarTexto(null), '');
            assert.equal(normalizarTexto(undefined), '');
            assert.equal(normalizarTexto(12345), '12345');
        });
    });

    describe('obtenerPropiedadPorRuta()', () => {
        const objeto = {
            id: 101,
            persona: {
                nombre: 'Carlos',
                contacto: {
                    telefono: '7788-9900'
                }
            }
        };

        test('obtiene propiedad de primer nivel', () => {
            assert.equal(obtenerPropiedadPorRuta(objeto, 'id'), 101);
        });

        test('obtiene propiedad anidada con notación de punto', () => {
            assert.equal(obtenerPropiedadPorRuta(objeto, 'persona.nombre'), 'Carlos');
            assert.equal(obtenerPropiedadPorRuta(objeto, 'persona.contacto.telefono'), '7788-9900');
        });

        test('retorna undefined para rutas inexistentes sin lanzar error', () => {
            assert.equal(obtenerPropiedadPorRuta(objeto, 'persona.direccion.calle'), undefined);
            assert.equal(obtenerPropiedadPorRuta(null, 'persona.nombre'), undefined);
        });
    });

    describe('filtrarColeccion()', () => {
        const catalogoPrueba = [
            { id: 1, nombre: 'Clínica Central San Salvador', tipo: 'General', observaciones: 'Atención 24/7' },
            { id: 2, nombre: 'Hospital San Rafael', tipo: 'Especialidades', observaciones: 'Quirófano disponible' },
            { id: 3, nombre: 'Unidad de Salud Santa Ana', tipo: 'Comunitaria', observaciones: 'Vacunación y consulta general' },
            { id: 4, nombre: 'Laboratorio Clínico San Miguel', tipo: 'Diagnóstico', observaciones: 'Análisis de sangre y glucosa' },
            {
                id: 5,
                nombre: 'Consulta Dr. Martínez',
                paciente: { nombre: 'María Hernández', dui: '01234567-8' },
                procedimiento: 'Electrocardiograma preventivo'
            }
        ];

        test('retorna todos los elementos si la consulta está vacía o son solo espacios', () => {
            const res1 = filtrarColeccion(catalogoPrueba, '');
            assert.equal(res1.length, 5);

            const res2 = filtrarColeccion(catalogoPrueba, '    ');
            assert.equal(res2.length, 5);
        });

        test('ignora mayúsculas y acentos al buscar', () => {
            // "clinic" debe coincidir con "Clínica Central" y "Laboratorio Clínico"
            const res = filtrarColeccion(catalogoPrueba, 'clinic');
            assert.equal(res.length, 2);
            assert.equal(res[0].id, 1);
            assert.equal(res[1].id, 4);

            // Búsqueda con tildes que busca texto sin tilde y viceversa
            const res2 = filtrarColeccion(catalogoPrueba, 'atención');
            assert.equal(res2.length, 1);
            assert.equal(res2[0].id, 1);

            const res3 = filtrarColeccion(catalogoPrueba, 'quirofano');
            assert.equal(res3.length, 1);
            assert.equal(res3[0].id, 2);
        });

        test('soporta búsqueda multi-término (AND lógico entre palabras)', () => {
            // "san general" debe encontrar "Clínica Central San Salvador" (General) y "Santa Ana" (consulta general)
            const res = filtrarColeccion(catalogoPrueba, 'san general');
            assert.equal(res.length, 2);
            assert.deepEqual(res.map(r => r.id), [1, 3]);

            // "laboratorio sangre"
            const resLab = filtrarColeccion(catalogoPrueba, 'laboratorio sangre');
            assert.equal(resLab.length, 1);
            assert.equal(resLab[0].id, 4);
        });

        test('soporta búsqueda en campos anidados especificados', () => {
            const res = filtrarColeccion(catalogoPrueba, 'maria electrocardiograma', {
                campos: ['paciente.nombre', 'procedimiento']
            });
            assert.equal(res.length, 1);
            assert.equal(res[0].id, 5);
        });

        test('soporta modo coincidencia "alguna" (OR lógico)', () => {
            const res = filtrarColeccion(catalogoPrueba, 'quirofano glucosa', {
                coincidencia: 'alguna'
            });
            assert.equal(res.length, 2);
            assert.deepEqual(res.map(r => r.id), [2, 4]);
        });

        test('respeta el límite de resultados cuando se especifica', () => {
            const res = filtrarColeccion(catalogoPrueba, 'san', { limite: 2 });
            assert.equal(res.length, 2);
        });

        test('maneja colecciones vacías o no arreglos sin fallar', () => {
            assert.deepEqual(filtrarColeccion([], 'prueba'), []);
            assert.deepEqual(filtrarColeccion(null, 'prueba'), []);
        });
    });

    describe('crearBuscadorDebounce()', () => {
        test('ejecuta la función tras el retraso establecido', async () => {
            let ejecuciones = 0;
            let ultimoValor = '';

            const debounced = crearBuscadorDebounce((val) => {
                ejecuciones++;
                ultimoValor = val;
            }, 50);

            debounced('a');
            debounced('ab');
            debounced('abc');

            assert.equal(ejecuciones, 0);

            await new Promise(r => setTimeout(r, 70));

            assert.equal(ejecuciones, 1);
            assert.equal(ultimoValor, 'abc');
        });

        test('permite cancelar ejecuciones pendientes', async () => {
            let ejecuciones = 0;
            const debounced = crearBuscadorDebounce(() => {
                ejecuciones++;
            }, 50);

            debounced('test');
            debounced.cancel();

            await new Promise(r => setTimeout(r, 70));
            assert.equal(ejecuciones, 0);
        });
    });

    describe('escaparHtml() y resaltarCoincidencias()', () => {
        test('escapa caracteres peligrosos contra inyecciones XSS', () => {
            assert.equal(
                escaparHtml('<script>alert("xss")</script> & "test"'),
                '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot;test&quot;'
            );
        });

        test('resalta términos coincidentes con etiqueta mark', () => {
            const resultado = resaltarCoincidencias('Clínica Médica San José', 'clinica');
            assert.ok(resultado.includes('<mark class="resaltado-glass">Clínica</mark>'));
            assert.ok(resultado.includes('Médica San José'));
        });

        test('resalta múltiples palabras aún si no llevan tilde en la búsqueda', () => {
            const resultado = resaltarCoincidencias('Atención Médica Integral', 'medica atencion');
            assert.ok(resultado.includes('<mark class="resaltado-glass">Atención</mark>'));
            assert.ok(resultado.includes('<mark class="resaltado-glass">Médica</mark>'));
        });

        test('resalta múltiples ocurrencias idénticas sin perder coincidencias por estado de regex', () => {
            const resultado = resaltarCoincidencias('Clínica San Salvador y clínica Santa Ana', 'clinica');
            const matches = resultado.match(/<mark class="resaltado-glass">/g) || [];
            assert.equal(matches.length, 2, 'Debe resaltar ambas apariciones de clínica');
            assert.ok(resultado.includes('<mark class="resaltado-glass">Clínica</mark>'));
            assert.ok(resultado.includes('<mark class="resaltado-glass">clínica</mark>'));
        });
    });
});
