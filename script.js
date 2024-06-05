let maxIntentos = 3
let intentos = 0

function iniciasSesion() {
    while (intentos < maxIntentos) {
        let usuario = prompt("Ingrese su Usuario");
        if (usuario === null || usuario.trim() === "") {
            alert("Debe ingresar un nombre de usuario valido.");
            continue;
        }

        let contraseña = prompt("Ingrese su Contraseña");
        if (contraseña === null || contraseña.trim() === "") {
            alert("Debe ingresar una contraseña valida.");
            continue;
        }

        if (usuario === 'vane davis' && contraseña === "031285") {
            alert("Bienvenida Vanesa");
            break;
        } else {
            intentos++;
            if (intentos === maxIntentos) {
                alert("Usted ha echo demasiados intentos, sera redirigido a la pagina principal");
                window.location.href = '../index.html';
            } else {
                alert("Usuario o contraseña incorrectos. intento " + " " + intentos + " " + 'de' + " " + maxIntentos + '.');
            }
        }
    }
}
iniciasSesion()