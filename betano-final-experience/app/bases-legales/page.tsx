import "./bases.css";

export const metadata = {
  title: "Bases Legales | Final Experience Betano",
};

export default function BasesLegales() {
  return (
    <main className="legal">
      <a href="/" className="legal-back">← Volver a la inscripción</a>

      <h1 className="legal-title">
        Bases Legales y Política de Tratamiento de Datos<br />
        <span>Concurso “Final Experience Betano”</span>
      </h1>

      <p className="legal-note">
        Documento borrador. Antes de su publicación debe ser revisado y validado
        por un abogado. Los campos entre corchetes <code>[ ]</code> deben
        completarse con los datos oficiales del organizador.
      </p>

      <section>
        <h2>1. Organizador y responsable</h2>
        <p>
          El concurso “Final Experience Betano” (en adelante, el “Concurso”) es
          organizado por <strong>AGENCIA VS SPA</strong>, RUT
          <strong>77.043.073-9</strong>, con domicilio en 
          <strong>Diagonal Oriente 1850, Providencia</strong> (en adelante, el "Organizador"). El
          Organizador actúa como <strong>responsable del tratamiento</strong> de
          los datos personales recolectados en el Concurso, conforme a la Ley
          N° 19.628 modificada por la Ley N° 21.719 sobre Protección de Datos
          Personales.
        </p>
        <p>
          El desarrollo y operación técnica de la plataforma de inscripción está
          a cargo de <strong>[NOMBRE DEL ENCARGADO / DESARROLLADOR]</strong>,
          quien actúa como <strong>encargado del tratamiento</strong> por cuenta
          del Organizador, sujeto a un acuerdo de tratamiento de datos.
        </p>
      </section>

      <section>
        <h2>2. Vigencia y participación</h2>
        <p>
          El período de inscripción se extiende desde
          <strong> [FECHA INICIO]</strong> hasta el
          <strong> [FECHA CIERRE]</strong>. El evento de la final se realizará el
          <strong> 19 de julio de 2026</strong>.
        </p>
        <p>
          Pueden participar personas naturales <strong>mayores de 18 años</strong>,
          residentes en Chile, que completen el formulario de inscripción con
          datos veraces y acepten estas bases. Quedan excluidos trabajadores del
          Organizador y sus empresas relacionadas, así como del encargado.
        </p>
        <p>
          Cada persona puede inscribirse una sola vez. Inscripciones duplicadas o
          con datos falsos serán descartadas.
        </p>
      </section>

      <section>
        <h2>3. Mecánica del sorteo y premios</h2>
        <p>
          Finalizado el período de inscripción, el Organizador realizará un
          <strong> sorteo aleatorio y auditable</strong> entre todos los
          participantes válidos. El sorteo utiliza un algoritmo de barajado con
          una <strong>semilla registrada</strong>, lo que permite reproducir y
          verificar el resultado.
        </p>
        <p>
          Los <strong>primeros 10 participantes</strong> del orden sorteado serán
          los ganadores. Si un ganador no acepta o no puede recibir el premio
          dentro del plazo informado, su lugar pasa al siguiente participante del
          orden sorteado (suplente), y así sucesivamente, hasta completar los 10
          premios.
        </p>
        <p>
          Premio: <strong>[DESCRIPCIÓN DEL PREMIO]</strong>. El premio es personal
          e intransferible y no es canjeable por dinero.
        </p>
      </section>

      <section>
        <h2>4. Notificación a ganadores</h2>
        <p>
          Los ganadores serán contactados al correo electrónico registrado en su
          inscripción. Tendrán un plazo de <strong>[N] días corridos</strong>
          desde el envío del correo para confirmar la aceptación del premio.
          Transcurrido ese plazo sin respuesta, se entenderá que renuncian y el
          premio pasará al siguiente suplente.
        </p>
      </section>

      <section>
        <h2>5. Tratamiento de datos personales</h2>
        <p>
          Al inscribirse, el participante otorga su <strong>consentimiento libre,
          específico, informado e inequívoco</strong> para que el Organizador
          trate los siguientes datos: nombre, correo electrónico, teléfono, tipo
          y número de documento de identidad y, opcionalmente, el motivo que
          escriba.
        </p>
        <p>
          <strong>Finalidad única:</strong> estos datos se utilizarán
          exclusivamente para administrar el Concurso —validar la inscripción,
          ejecutar el sorteo y contactar a los ganadores—.
          <strong> No se usarán para marketing, publicidad, perfilamiento ni
          ningún fin distinto</strong>, ni se cederán a terceros ajenos a la
          operación del Concurso.
        </p>
        <p>
          <strong>Plazo de conservación:</strong> los datos se conservarán
          únicamente durante el Concurso y serán
          <strong> eliminados tras la realización del evento del 19 de julio de
          2026</strong>, una vez entregados los premios y cerrado el proceso,
          salvo obligación legal que exija conservarlos por más tiempo.
        </p>
        <p>
          <strong>Seguridad:</strong> los datos se almacenan en infraestructura
          con acceso restringido y controles de seguridad. El acceso al panel de
          administración está protegido por autenticación.
        </p>
      </section>

      <section>
        <h2>6. Derechos del titular (ARCO+)</h2>
        <p>
          El participante puede ejercer en cualquier momento sus derechos de
          <strong> acceso, rectificación, cancelación (supresión), oposición,
          portabilidad y bloqueo</strong> de sus datos, así como retirar su
          consentimiento sin que ello afecte la licitud del tratamiento previo.
        </p>
        <p>
          Para ejercer estos derechos, escribir a
          <strong> [CORREO DE CONTACTO / DPO]</strong>. Las solicitudes se
          responderán dentro de un plazo máximo de <strong>30 días corridos</strong>.
          El retiro del consentimiento durante el Concurso implica la
          imposibilidad de continuar participando.
        </p>
      </section>

      <section>
        <h2>7. Aceptación y modificaciones</h2>
        <p>
          La participación implica la aceptación íntegra de estas bases. El
          Organizador podrá modificarlas por causa justificada, informando a
          través de los mismos canales del Concurso. Cualquier controversia se
          regirá por la legislación chilena.
        </p>
      </section>

      <p className="legal-foot">
        Última actualización: [FECHA]. Documento referencial preparado conforme a
        la Ley N° 21.719. No constituye asesoría legal.
      </p>
    </main>
  );
}
