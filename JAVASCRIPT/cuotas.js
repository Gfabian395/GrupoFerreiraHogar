function CalcularCuota() {
    let monto =
        parseFloat(document.getElementById('monto').value);

    let cuotas =
        parseInt(document.getElementById('cuotas').value);

    let porcentaje = 0
    switch (cuotas) {
        case 2:
            porcentaje = 0.2
            break;
        case 4:
            porcentaje = 0.5
            break;
        case 6:
            porcentaje = 0.8
            break;
        case 9:
            porcentaje = 1.2
            break;
        case 12:
            porcentaje = 1.5
            break;
        default:
            alert('Cantidad de cuotas no valida');
            return;
    }
    let cuota = Math.floor((monto * (1 + porcentaje) / cuotas) * 100) / 100 - 0.03;
    let cuotaSinDecimales = Math.floor(cuota).toLocaleString('es-AR',);
    let CuotaRedondeada = '$' + cuotaSinDecimales.slice(0.-7);
    document.getElementById('resultado').textContent = "cuota mensual de: " + CuotaRedondeada;
}