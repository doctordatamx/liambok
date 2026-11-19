const copy = document.querySelector('#copiar-cita');
const citation = document.querySelector('#cita');
const status = document.querySelector('#estado-cita');

copy.hidden = false;
copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(citation.textContent.trim());
    status.textContent = 'Cita copiada.';
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(citation);
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = 'La cita está seleccionada. Usa el comando Copiar de tu dispositivo.';
  }
});
