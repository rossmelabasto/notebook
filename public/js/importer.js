// importer.js — importar un chat de WhatsApp (pegar el .txt o subir el .zip con fotos y audios)
import { state, el, icon, btn, api, toast, toastError, openModal, field, input, setBtnBusy } from './core.js';
import { t } from './i18n.js';
import { refreshNotes, refreshSubjects, renderNotes, renderSubjects } from './shell.js';
import { openNote } from './editor.js';

export function openImportModal() {
  const { modal, close } = openModal({ title: t('import.title'), sub: t('import.sub'), wide: true });

  const title = input('text', 'WhatsApp', { maxLength: 200 });
  modal.appendChild(field(t('import.noteTitle'), title));

  const tabs = el('div', 'seg');
  const zipTab = btn('seg-btn active', { icon: 'upload', label: t('import.zipTab') });
  const txtTab = btn('seg-btn', { icon: 'fileText', label: t('import.txtTab') });
  tabs.append(zipTab, txtTab);
  modal.appendChild(tabs);

  const zipPane = el('div', 'import-pane');
  const zipInput = el('input');
  zipInput.type = 'file';
  zipInput.accept = '.zip,application/zip';
  zipInput.hidden = true;
  const drop = btn('dropzone');
  const dropLabel = el('span', null, t('import.chooseZip'));
  drop.append(icon('upload'), dropLabel, el('span', 'hint', t('import.zipHint')));
  drop.onclick = () => zipInput.click();
  zipInput.onchange = () => {
    const f = zipInput.files[0];
    dropLabel.textContent = f ? `${f.name} · ${(f.size / 1048576).toFixed(1)} MB` : t('import.chooseZip');
    drop.classList.toggle('has-file', !!f);
    if (f && title.value === 'WhatsApp') {
      const m = f.name.match(/WhatsApp Chat (?:with|con) (.+?)(?:\.zip)?$/i);
      if (m) title.value = m[1];
    }
  };
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer.files[0]) { zipInput.files = e.dataTransfer.files; zipInput.onchange(); }
  });
  zipPane.append(drop, zipInput);

  const txtPane = el('div', 'import-pane');
  txtPane.hidden = true;
  const ta = el('textarea', 'import-ta');
  ta.placeholder = t('import.pastePh');
  txtPane.appendChild(ta);
  modal.append(zipPane, txtPane);

  zipTab.onclick = () => { zipTab.classList.add('active'); txtTab.classList.remove('active'); zipPane.hidden = false; txtPane.hidden = true; };
  txtTab.onclick = () => { txtTab.classList.add('active'); zipTab.classList.remove('active'); zipPane.hidden = true; txtPane.hidden = false; ta.focus(); };

  const me = input('text', '', { placeholder: t('import.meNamePh') });
  modal.appendChild(field(t('import.meName'), me));
  modal.appendChild(el('p', 'hint', t('import.howTo')));

  const ok = btn('btn btn-primary', { icon: 'upload', label: t('import.go') });
  const actions = el('div', 'actions');
  actions.append(btn('btn', { label: t('common.cancel'), onClick: () => close() }), ok);
  modal.appendChild(actions);

  ok.onclick = async () => {
    const useZip = !zipPane.hidden;
    const zip = zipInput.files?.[0];
    if (useZip && !zip) return toast(t('import.needZip'), 'error');
    if (!useZip && !ta.value.trim()) return toast(t('import.needText'), 'error');
    setBtnBusy(ok, true);
    const subject_id = state.subject === 'orphaned' ? null : state.subject;
    try {
      let r;
      if (useZip) {
        const fd = new FormData();
        fd.append('zip', zip);
        fd.append('title', title.value.trim() || 'WhatsApp');
        fd.append('me_name', me.value.trim());
        if (subject_id !== null) fd.append('subject_id', String(subject_id));
        r = await api('/api/import/whatsapp-zip', { method: 'POST', body: fd });
      } else {
        r = await api('/api/import/whatsapp', { method: 'POST', body: { title: title.value.trim() || 'WhatsApp', text: ta.value, me_name: me.value.trim(), subject_id } });
      }
      close();
      await refreshSubjects();
      await refreshNotes();
      renderSubjects();
      renderNotes();
      await openNote(r.id);
      toast(useZip ? t('import.doneZip', { n: r.count, i: r.images, a: r.audios }) : t('import.done', { n: r.count }), 'ok');
    } catch (e) {
      setBtnBusy(ok, false);
      toastError(e);
    }
  };
  title.focus();
  title.select();
}
