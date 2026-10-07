// i18n.js — textos en español e inglés; el idioma se elige en el menú de cuenta (o según el navegador)
const ES = {
  'app.updated': 'Hay una versión nueva del Notebook.',
  'app.reload': 'Recargar',
  'land.titleTag': 'tus apuntes, con memoria', 'land.badge': 'Open source · gratis · en tu propio servidor',
  'land.h1a': 'Tus apuntes,', 'land.h1b': 'con memoria.',
  'land.lead': 'Escribe como en un chat contigo mismo: texto, fotos de la pizarra y notas de voz. Después pregúntale a tus apuntes, búscalos al instante y estudia con flashcards y quizzes hechos con lo que tú escribiste.',
  'land.ctaEnter': 'Entrar al Notebook', 'land.ctaRepo': 'Ver en GitHub', 'land.whatIs': '¿Qué es Notebook?',
  'land.altDesktop': 'Notebook en la computadora: un apunte como chat', 'land.altMobile': 'Notebook en el celular',
  'land.featTitle': 'Todo lo que anotas, a mano cuando lo necesitas', 'land.featSub': 'Pensado para estudiar: rápido para anotar, inteligente para repasar.',
  'land.f1t': 'Un chat contigo mismo', 'land.f1d': 'Anota sin fricción: mensajes, listas pegadas de WhatsApp, imágenes y audios. Se envía al instante, aunque la red esté lenta.',
  'land.f2t': 'Pregúntale a tus apuntes', 'land.f2d': 'Responde solo con lo que escribiste y cita la fuente; toca la cita y te lleva al mensaje exacto.',
  'land.f3t': 'Fotos y voz que se leen', 'land.f3d': 'La IA transcribe el texto de las fotos y tus notas de voz, así también se pueden buscar y preguntar.',
  'land.f4t': 'Estudia con lo tuyo', 'land.f4d': 'Resúmenes, flashcards y quizzes de opción múltiple generados a partir de un apunte o una materia.',
  'land.f5t': 'Búsqueda al instante', 'land.f5d': 'Ctrl+K busca palabras en todos tus apuntes (sin importar tildes), dentro de fotos y audios incluidos.',
  'land.f6t': 'Tuyo y privado', 'land.f6d': 'Corre en tu servidor, cada usuario ve solo lo suyo y la IA usa planes gratuitos. Instálalo como app en el celular.',
  'land.howTitle': 'Cómo funciona',
  'land.s1t': 'Anota', 'land.s1d': 'Crea materias y apuntes. Escribe, pega, sube fotos o graba la clase.',
  'land.s2t': 'Pregunta', 'land.s2d': 'Búsqueda híbrida por significado y por palabra encuentra lo relevante; la IA responde con citas.',
  'land.s3t': 'Repasa', 'land.s3d': 'Genera flashcards o un quiz del tema que te toca y marca lo que ya sabes.',
  'land.osTitle': 'Código abierto', 'land.osText': 'Notebook es software libre (licencia MIT). Puedes leer el código, instalarlo en tu propio servidor con una Raspberry o una PC vieja, y mejorarlo.',
  'land.osRepo': 'Repositorio en GitHub', 'land.osHost': 'Instálalo tú', 'land.madeBy': 'Hecho por', 'land.portfolio': 'Portafolio', 'land.license': 'Licencia MIT',
  'appearance.title': 'Apariencia', 'appearance.sub': 'Se guarda en este dispositivo.', 'appearance.theme': 'Tema',
  'appearance.system': 'Sistema', 'appearance.light': 'Claro', 'appearance.dark': 'Oscuro', 'appearance.accent': 'Color',
  'appearance.brand': 'Lima y violeta (por defecto)', 'appearance.violet': 'Violeta', 'appearance.lime': 'Lima', 'appearance.blue': 'Azul', 'appearance.amber': 'Ámbar', 'appearance.pink': 'Rosa',
  'appearance.toggle': 'Cambiar tema claro/oscuro',

  'nav.notes': 'Apuntes', 'nav.ask': 'Preguntar', 'nav.study': 'Estudiar', 'nav.search': 'Buscar', 'nav.menu': 'Menú', 'nav.sidebar': 'Materias y apuntes',

  'common.back': 'Volver', 'common.cancel': 'Cancelar', 'common.close': 'Cerrar', 'common.copied': 'Copiado', 'common.copy': 'Copiar',
  'common.copyError': 'Copiar error', 'common.create': 'Crear', 'common.delete': 'Eliminar', 'common.deleteAll': 'Eliminar todo',
  'common.edit': 'Editar', 'common.name': 'Nombre', 'common.options': 'Opciones', 'common.rename': 'Renombrar', 'common.retry': 'Reintentar',
  'common.save': 'Guardar', 'common.toBottom': 'Ir al final',

  'date.today': 'Hoy', 'date.yesterday': 'Ayer',

  'auth.setupTitle': 'Configuración inicial', 'auth.setupSub': 'Primera vez: crea la cuenta de administrador.',
  'auth.tagline': 'Tus apuntes, con memoria.', 'auth.setupToken': 'Token de configuración', 'auth.username': 'Usuario',
  'auth.password': 'Contraseña', 'auth.passwordMin': 'Contraseña (mín. 8)', 'auth.repeatPassword': 'Repite la contraseña',
  'auth.createAccount': 'Crear cuenta', 'auth.signIn': 'Entrar', 'auth.mismatch': 'Las contraseñas no coinciden',

  'subj.title': 'Materias', 'subj.one': 'Materia', 'subj.general': 'General', 'subj.unfiled': 'Sin carpeta', 'subj.all': 'Todo',
  'subj.new': 'Nueva materia', 'subj.newSub': 'Ej.: Física, Cálculo, Programación… o "Semana 1".', 'subj.rename': 'Renombrar materia',
  'subj.renameSub': 'Los apuntes se quedan adentro.', 'subj.created': 'Materia creada', 'subj.renamed': 'Materia renombrada',
  'subj.deleteTitle': 'Eliminar "{name}"', 'subj.deleteSub': '¿Qué hacemos con sus apuntes?', 'subj.moveToUnfiled': 'Pasarlos a "Sin carpeta"',
  'subj.deleteWithNotes': 'Eliminar también los apuntes', 'subj.deleteNotesTitle': 'Eliminar apuntes',
  'subj.deleteNotesMsg': 'Se eliminarán {n} apuntes con sus imágenes y audios. No se puede deshacer.',
  'subj.movedToUnfiled': 'Apuntes movidos a "Sin carpeta"', 'subj.deleted': 'Materia y apuntes eliminados',

  'note.new': 'Nuevo apunte', 'note.newShort': 'Nuevo', 'note.untitled': 'Apunte sin título', 'note.title': 'Título del apunte',
  'note.emptyIn': 'No hay apuntes en {name}.', 'note.noMessages': 'Sin mensajes', 'note.indexed': 'Listo para preguntas',
  'note.indexing': 'Indexando…', 'note.selectOrCreate': 'Elige un apunte o crea uno nuevo',
  'note.tipsDesktop': 'Escribe como en un chat contigo mismo: texto, fotos de la pizarra o notas de voz. Después pregúntale a tus apuntes o genera flashcards. Ctrl+K busca en todo.',
  'note.created': 'Creado', 'note.msgs': 'mensajes', 'note.searchIn': 'Buscar en el apunte', 'note.searchPlaceholder': 'Buscar en este apunte…',
  'note.older': 'Anterior (Enter)', 'note.newer': 'Siguiente (Shift+Enter)', 'note.showStarred': 'Ver importantes',
  'note.starredOnly': 'Solo importantes ({n})', 'note.showAll': 'Ver todo', 'note.noStarred': 'Todavía no marcaste mensajes importantes.',
  'note.emptyThread': 'Este apunte está vacío.', 'note.emptyHint': 'Escribe, pega texto, sube fotos o graba una nota de voz.',
  'note.exportMd': 'Exportar a Markdown', 'note.delete': 'Eliminar apunte', 'note.deleteTitle': 'Eliminar apunte',
  'note.deleteMsg': '¿Eliminar "{title}"? Se borran sus mensajes, imágenes y audios.', 'note.deleted': 'Apunte eliminado',
  'note.movedTo': 'Movido a {name}',

  'msg.image': 'Imagen', 'msg.audio': 'Nota de voz', 'msg.openImage': 'Ver imagen', 'msg.openOriginal': 'Abrir original',
  'msg.transcription': 'Texto de la imagen', 'msg.description': 'Descripción', 'msg.transcript': 'Transcripción', 'msg.empty': '(vacío)',
  'msg.reading': 'Leyendo la imagen…', 'msg.transcribing': 'Transcribiendo…', 'msg.processError': 'No se pudo procesar',
  'msg.savedReindex': 'Guardado; se vuelve a indexar', 'msg.star': 'Marcar como importante', 'msg.unstar': 'Quitar de importantes',
  'msg.deleteTitle': 'Eliminar mensaje', 'msg.deleteMsg': '¿Eliminar este mensaje?', 'msg.deleteImageMsg': '¿Eliminar la imagen? Su texto deja de ser buscable.',
  'msg.deleteAudioMsg': '¿Eliminar la nota de voz y su transcripción?', 'msg.deleted': 'Mensaje eliminado',

  'compose.placeholder': 'Escribe en tu apunte…  (Enter envía · Shift+Enter salto de línea)',
  'compose.placeholderShort': 'Escribe en tu apunte…', 'compose.label': 'Nuevo mensaje', 'compose.attach': 'Subir imágenes',
  'compose.record': 'Grabar nota de voz', 'compose.send': 'Enviar',
  'compose.pasteSplitAction': 'Enviar como {n} mensajes', 'compose.failed': 'No se envió', 'compose.offline': 'Sin conexión',
  'compose.discard': 'Descartar', 'compose.imagesOnly': 'Solo imágenes JPG, PNG, WebP o GIF',
  'compose.imagesUploaded': '{n} imagen(es) subida(s); leyendo el texto…',

  'voice.unsupported': 'Este navegador no puede grabar audio', 'voice.denied': 'No hay permiso para usar el micrófono',
  'voice.recording': 'Grabando…', 'voice.send': 'Enviar nota de voz',

  'search.open': 'Buscar en todo', 'search.placeholder': 'Buscar palabras en todos tus apuntes…',
  'search.hint': 'Escribe al menos 2 letras. Busca palabras exactas (sin importar tildes) en textos, fotos y audios.',
  'search.none': 'Nada con "{q}". Prueba preguntándole a la IA.', 'search.askInstead': 'Preguntarle a la IA en lugar de buscar',

  'ask.quick': 'Pregunta rápida', 'ask.quickSub': 'Preguntas sueltas, sin memoria', 'ask.convoSub': 'Conversación: recuerda lo anterior',
  'ask.chats': 'Chats', 'ask.newChat': 'Nuevo chat', 'ask.noChats': 'Sin chats todavía. Un chat recuerda la conversación.',
  'ask.scope': 'Dónde buscar', 'ask.placeholder': 'Pregunta sobre tus apuntes ({scope})…', 'ask.placeholderConvo': 'Escribe tu pregunta…',
  'ask.stop': 'Detener', 'ask.stopped': 'Detenido.', 'ask.insufficient': 'No encontré eso en tus apuntes. Prueba con otras palabras o en otra materia.',
  'ask.emptyTitle': 'Pregúntale a tus apuntes', 'ask.emptyHint': 'Responde solo con lo que escribiste, y cita de dónde lo sacó. Toca una cita para ir al mensaje.',
  'ask.ex1': '¿Qué temas vimos esta semana?', 'ask.ex2': 'Resume lo más importante de la última clase', 'ask.ex3': 'Explícame la diferencia entre los conceptos principales',
  'ask.sources': 'Fuentes ({n}) · coincidencia {pct}%', 'ask.closest': 'Lo más parecido que encontré ({n})', 'ask.jump': 'Ir a ese mensaje',
  'ask.keyword': 'palabra', 'ask.searchedFor': 'Busqué: {q}', 'ask.renameChat': 'Renombrar chat', 'ask.deleteChat': 'Eliminar chat',
  'ask.deleteChatMsg': '¿Eliminar "{title}" y sus mensajes?', 'ask.chatDeleted': 'Chat eliminado', 'ask.nMsgs': '{n} mensajes',
  'ask.inSubject': 'Preguntar en esta materia',

  'study.create': 'Crear material de estudio', 'study.summary': 'Resumen', 'study.flashcards': 'Flashcards', 'study.quiz': 'Quiz',
  'study.summaryDesc': 'Ideas clave ordenadas', 'study.flashcardsDesc': 'Pregunta y respuesta para memorizar', 'study.quizDesc': 'Opción múltiple con explicación',
  'study.from': 'De', 'study.topic': 'Tema (opcional)', 'study.topicPh': 'Ej.: mitosis, segunda ley de Newton…', 'study.generate': 'Generar',
  'study.hint': 'Usa solo lo que está en tus apuntes.', 'study.generating': 'La IA está leyendo tus apuntes…', 'study.ready': 'Listo',
  'study.saved': 'Guardados', 'study.noneYet': 'Todavía no generaste nada aquí.', 'study.deleteTitle': 'Eliminar material',
  'study.partial': 'Tus apuntes son largos: se usó una parte (lo marcado como importante primero). Pon un tema para enfocarlo.',
  'study.question': 'Pregunta', 'study.answer': 'Respuesta', 'study.prev': 'Anterior', 'study.next': 'Siguiente', 'study.gotIt': 'Me la sé',
  'study.shuffle': 'Mezclar', 'study.known': '{n} sabidas', 'study.fcHint': 'Toca la tarjeta para voltearla · ← → para moverte',
  'study.score': '{right} de {done} correctas · {total} preguntas', 'study.retry': 'Reintentar', 'study.thisNote': 'Este apunte',
  'study.fromNote': 'Estudiar este apunte', 'study.fromSubject': 'Estudiar esta materia',

  'import.title': 'Importar chat de WhatsApp', 'import.sub': 'Trae un chat (por ejemplo, el grupo del curso) como apunte, con fotos y audios.',
  'import.noteTitle': 'Título del apunte', 'import.zipTab': 'Archivo .zip', 'import.txtTab': 'Pegar texto',
  'import.chooseZip': 'Elige o arrastra el .zip exportado', 'import.zipHint': 'Las fotos se leen con IA y los audios se transcriben.',
  'import.pastePh': 'Pega aquí el texto exportado…', 'import.meName': 'Tu nombre en ese chat (opcional)',
  'import.meNamePh': 'Así tus mensajes van a la derecha', 'import.howTo': 'En WhatsApp: abre el chat → ⋮ → Más → Exportar chat → Incluir archivos.',
  'import.go': 'Importar', 'import.needZip': 'Elige el .zip', 'import.needText': 'Pega el texto exportado',
  'import.done': '{n} mensajes importados', 'import.doneZip': '{n} mensajes, {i} imágenes y {a} audios importados (procesando…)',

  'account.title': 'Cuenta', 'account.user': 'usuario', 'account.sessions': 'Sesiones abiertas',
  'account.sessionsSub': 'Dispositivos donde tu cuenta está abierta. Cierra los que no reconozcas.',
  'account.thisDevice': 'este dispositivo', 'account.lastSeen': 'activo', 'account.since': 'desde', 'account.closeSession': 'Cerrar',
  'account.closeOthers': 'Cerrar las demás', 'account.closedN': '{n} sesión(es) cerrada(s)', 'account.unknownDevice': 'Dispositivo desconocido',
  'account.password': 'Cambiar contraseña', 'account.passwordSub': 'Se cerrarán tus otras sesiones.', 'account.currentPassword': 'Contraseña actual',
  'account.passwordChanged': 'Contraseña cambiada ({n} sesiones cerradas)', 'account.export': 'Descargar todo (.zip)',
  'account.exporting': 'Preparando la descarga…', 'account.install': 'Instalar app', 'account.logout': 'Cerrar sesión',
  'account.users': 'Usuarios', 'account.usersSub': 'Cuentas del Notebook y estado del sistema.', 'account.newUser': 'Nuevo usuario',
  'account.newUserSub': 'Tú le pasas el usuario y la contraseña.', 'account.userCreated': 'Usuario creado', 'account.reset': 'Contraseña',
  'account.resetTitle': 'Nueva contraseña para {name}', 'account.resetSub': 'Se cerrarán todas sus sesiones.', 'account.resetDone': 'Contraseña cambiada',
  'account.deleteUser': 'Eliminar a {name}', 'account.deleteUserMsg': 'Se borran su cuenta y sus {n} apuntes con imágenes y audios. No se puede deshacer.',
  'account.userDeleted': 'Usuario eliminado', 'account.never': 'nunca entró', 'account.models': 'Modelos',
  'account.stNotes': 'apuntes', 'account.stMessages': 'mensajes', 'account.stChunks': 'fragmentos', 'account.stPending': 'pendientes',

  'err.offline': 'Sin conexión con el servidor',
  'err.not_authenticated': 'Tu sesión terminó, vuelve a entrar', 'err.rate_limited': 'Demasiadas solicitudes, espera un momento',
  'err.csrf': 'Solicitud rechazada; recarga la página', 'err.internal': 'Error interno del servidor', 'err.file_too_large': 'Archivo demasiado grande',
  'err.too_large': 'Demasiado grande', 'err.bad_id': 'Identificador inválido', 'err.bad_setup_token': 'Token de configuración incorrecto',
  'err.bad_username': 'Usuario inválido (3-32: letras, números, . _ -)', 'err.bad_password': 'Contraseña inválida (mínimo 8 caracteres)',
  'err.bad_credentials': 'Usuario o contraseña incorrectos', 'err.bad_current_password': 'La contraseña actual no es correcta',
  'err.user_exists': 'Ese usuario ya existe', 'err.cannot_delete_self': 'No puedes eliminar tu propia cuenta',
  'err.note_not_found': 'Apunte no encontrado', 'err.bad_subject': 'Materia inválida', 'err.subject_exists': 'Ya tienes una materia con ese nombre',
  'err.empty_title': 'El título no puede estar vacío', 'err.empty_message': 'Mensaje vacío o demasiado largo',
  'err.bad_image': 'Formato no soportado (usa JPG, PNG, WebP o GIF)', 'err.bad_audio': 'Formato de audio no soportado',
  'err.no_messages': 'No se encontraron mensajes de WhatsApp', 'err.bad_zip': 'Ese archivo no es un .zip válido',
  'err.zip_too_big': 'El .zip es demasiado grande', 'err.no_chat_txt': 'No está el .txt del chat dentro del .zip',
  'err.too_many_messages': 'Demasiados mensajes', 'err.import_too_big': 'Exportación demasiado grande (máx. 5 MB)',
  'err.bad_question': 'Pregunta inválida', 'err.ai_busy': 'La IA está saturada, intenta en un minuto', 'err.ai_error': 'La IA no pudo responder, intenta de nuevo',
  'err.nothing_to_study': 'Todavía no hay nada indexado para estudiar ahí', 'err.study_failed': 'La IA devolvió algo inservible, intenta de nuevo',
  'err.not_found': 'No encontrado', 'err.already_setup': 'Ya hay un usuario registrado', 'err.session_not_found': 'Sesión no encontrada',
  'err.user_not_found': 'Usuario no encontrado', 'err.admins_only': 'Solo para administradores', 'err.bad_name': 'Nombre inválido',
  'err.subject_not_found': 'Materia no encontrada', 'err.message_not_found': 'Mensaje no encontrado', 'err.no_files': 'No llegó ningún archivo',
  'err.image_not_found': 'Imagen no encontrada', 'err.audio_not_found': 'Audio no encontrado', 'err.nothing_to_update': 'Nada que guardar',
  'err.empty_import': 'Pega el texto exportado de WhatsApp', 'err.convo_not_found': 'Chat no encontrado', 'err.bad_kind': 'Tipo desconocido',
  'err.study_not_found': 'Material no encontrado', 'err.bad_json': 'Solicitud inválida',
};

const EN = {
  'app.updated': 'A new version of Notebook is available.', 'app.reload': 'Reload',
  'land.titleTag': 'your notes, with memory', 'land.badge': 'Open source · free · on your own server',
  'land.h1a': 'Your notes,', 'land.h1b': 'with memory.',
  'land.lead': 'Write like a chat with yourself: text, photos of the board and voice notes. Then ask your notes, search them instantly and study with flashcards and quizzes made from what you wrote.',
  'land.ctaEnter': 'Open Notebook', 'land.ctaRepo': 'View on GitHub', 'land.whatIs': 'What is Notebook?',
  'land.altDesktop': 'Notebook on desktop: a note as a chat', 'land.altMobile': 'Notebook on a phone',
  'land.featTitle': 'Everything you write down, at hand when you need it', 'land.featSub': 'Built for studying: fast to capture, smart to review.',
  'land.f1t': 'A chat with yourself', 'land.f1d': 'Capture without friction: messages, lists pasted from WhatsApp, images and audio. Sent instantly, even on a slow network.',
  'land.f2t': 'Ask your notes', 'land.f2d': 'Answers only from what you wrote, with citations; tap one to jump to the exact message.',
  'land.f3t': 'Photos and voice, readable', 'land.f3d': 'AI transcribes text in photos and your voice notes, so they are searchable and askable too.',
  'land.f4t': 'Study with your own material', 'land.f4d': 'Summaries, flashcards and multiple-choice quizzes generated from a note or a whole subject.',
  'land.f5t': 'Instant search', 'land.f5d': 'Ctrl+K finds words across all your notes (accent-insensitive), inside photos and audio too.',
  'land.f6t': 'Yours and private', 'land.f6d': 'Runs on your server, each user sees only their own notes, and the AI uses free tiers. Install it as a phone app.',
  'land.howTitle': 'How it works',
  'land.s1t': 'Capture', 'land.s1d': 'Create subjects and notes. Type, paste, upload photos or record the class.',
  'land.s2t': 'Ask', 'land.s2d': 'Hybrid search by meaning and by keyword finds what matters; the AI answers with citations.',
  'land.s3t': 'Review', 'land.s3d': 'Generate flashcards or a quiz on the topic you need and mark what you already know.',
  'land.osTitle': 'Open source', 'land.osText': 'Notebook is free software (MIT license). Read the code, run it on your own server — a Raspberry Pi or an old PC is enough — and make it better.',
  'land.osRepo': 'GitHub repository', 'land.osHost': 'Self-host it', 'land.madeBy': 'Made by', 'land.portfolio': 'Portfolio', 'land.license': 'MIT license',
  'appearance.title': 'Appearance', 'appearance.sub': 'Saved on this device.', 'appearance.theme': 'Theme',
  'appearance.system': 'System', 'appearance.light': 'Light', 'appearance.dark': 'Dark', 'appearance.accent': 'Color',
  'appearance.brand': 'Lime & violet (default)', 'appearance.violet': 'Violet', 'appearance.lime': 'Lime', 'appearance.blue': 'Blue', 'appearance.amber': 'Amber', 'appearance.pink': 'Pink',
  'appearance.toggle': 'Toggle light/dark theme',
  'nav.notes': 'Notes', 'nav.ask': 'Ask', 'nav.study': 'Study', 'nav.search': 'Search', 'nav.menu': 'Menu', 'nav.sidebar': 'Subjects and notes',
  'common.back': 'Back', 'common.cancel': 'Cancel', 'common.close': 'Close', 'common.copied': 'Copied', 'common.copy': 'Copy',
  'common.copyError': 'Copy error', 'common.create': 'Create', 'common.delete': 'Delete', 'common.deleteAll': 'Delete all',
  'common.edit': 'Edit', 'common.name': 'Name', 'common.options': 'Options', 'common.rename': 'Rename', 'common.retry': 'Retry',
  'common.save': 'Save', 'common.toBottom': 'Scroll to bottom',
  'date.today': 'Today', 'date.yesterday': 'Yesterday',
  'auth.setupTitle': 'Initial setup', 'auth.setupSub': 'First run: create the administrator account.', 'auth.tagline': 'Your notes, with memory.',
  'auth.setupToken': 'Setup token', 'auth.username': 'Username', 'auth.password': 'Password', 'auth.passwordMin': 'Password (min 8)',
  'auth.repeatPassword': 'Repeat password', 'auth.createAccount': 'Create account', 'auth.signIn': 'Sign in', 'auth.mismatch': 'Passwords do not match',
  'subj.title': 'Subjects', 'subj.one': 'Subject', 'subj.general': 'General', 'subj.unfiled': 'Unfiled', 'subj.all': 'Everything',
  'subj.new': 'New subject', 'subj.newSub': 'E.g. Physics, Calculus, Programming… or "Week 1".', 'subj.rename': 'Rename subject',
  'subj.renameSub': 'Notes stay inside.', 'subj.created': 'Subject created', 'subj.renamed': 'Subject renamed',
  'subj.deleteTitle': 'Delete "{name}"', 'subj.deleteSub': 'What should we do with its notes?', 'subj.moveToUnfiled': 'Move them to "Unfiled"',
  'subj.deleteWithNotes': 'Delete the notes too', 'subj.deleteNotesTitle': 'Delete notes',
  'subj.deleteNotesMsg': '{n} notes will be deleted with their images and audio. This cannot be undone.',
  'subj.movedToUnfiled': 'Notes moved to "Unfiled"', 'subj.deleted': 'Subject and notes deleted',
  'note.new': 'New note', 'note.newShort': 'New', 'note.untitled': 'Untitled note', 'note.title': 'Note title',
  'note.emptyIn': 'No notes in {name}.', 'note.noMessages': 'No messages', 'note.indexed': 'Ready for questions', 'note.indexing': 'Indexing…',
  'note.selectOrCreate': 'Pick a note or create a new one',
  'note.tipsDesktop': 'Write like a chat with yourself: text, photos of the board or voice notes. Then ask your notes or generate flashcards. Ctrl+K searches everything.',
  'note.created': 'Created', 'note.msgs': 'messages', 'note.searchIn': 'Search in note', 'note.searchPlaceholder': 'Search in this note…',
  'note.older': 'Older (Enter)', 'note.newer': 'Newer (Shift+Enter)', 'note.showStarred': 'Show starred', 'note.starredOnly': 'Starred only ({n})',
  'note.showAll': 'Show all', 'note.noStarred': 'No starred messages yet.', 'note.emptyThread': 'This note is empty.',
  'note.emptyHint': 'Type, paste text, upload photos or record a voice note.', 'note.exportMd': 'Export to Markdown', 'note.delete': 'Delete note',
  'note.deleteTitle': 'Delete note', 'note.deleteMsg': 'Delete "{title}"? Its messages, images and audio are removed.', 'note.deleted': 'Note deleted',
  'note.movedTo': 'Moved to {name}',
  'msg.image': 'Image', 'msg.audio': 'Voice note', 'msg.openImage': 'View image', 'msg.openOriginal': 'Open original',
  'msg.transcription': 'Text in image', 'msg.description': 'Description', 'msg.transcript': 'Transcript', 'msg.empty': '(empty)',
  'msg.reading': 'Reading the image…', 'msg.transcribing': 'Transcribing…', 'msg.processError': 'Could not process it',
  'msg.savedReindex': 'Saved; re-indexing', 'msg.star': 'Mark as important', 'msg.unstar': 'Unstar', 'msg.deleteTitle': 'Delete message',
  'msg.deleteMsg': 'Delete this message?', 'msg.deleteImageMsg': 'Delete the image? Its text stops being searchable.',
  'msg.deleteAudioMsg': 'Delete the voice note and its transcript?', 'msg.deleted': 'Message deleted',
  'compose.placeholder': 'Write in your note…  (Enter sends · Shift+Enter new line)', 'compose.placeholderShort': 'Write in your note…',
  'compose.label': 'New message', 'compose.attach': 'Upload images', 'compose.record': 'Record voice note', 'compose.send': 'Send', 'compose.pasteSplitAction': 'Send as {n} messages',
  'compose.failed': 'Not sent', 'compose.offline': 'No connection', 'compose.discard': 'Discard',
  'compose.imagesOnly': 'JPG, PNG, WebP or GIF images only', 'compose.imagesUploaded': '{n} image(s) uploaded; reading the text…',
  'voice.unsupported': 'This browser cannot record audio', 'voice.denied': 'Microphone permission denied', 'voice.recording': 'Recording…',
  'voice.send': 'Send voice note',
  'search.open': 'Search everything', 'search.placeholder': 'Search words in all your notes…',
  'search.hint': 'Type at least 2 letters. Finds exact words (accents ignored) in text, photos and audio.',
  'search.none': 'Nothing for "{q}". Try asking the AI.', 'search.askInstead': 'Ask the AI instead of searching',
  'ask.quick': 'Quick ask', 'ask.quickSub': 'Single questions, no memory', 'ask.convoSub': 'Conversation: remembers the thread',
  'ask.chats': 'Chats', 'ask.newChat': 'New chat', 'ask.noChats': 'No chats yet. A chat remembers the conversation.', 'ask.scope': 'Where to look',
  'ask.placeholder': 'Ask about your notes ({scope})…', 'ask.placeholderConvo': 'Type your question…', 'ask.stop': 'Stop', 'ask.stopped': 'Stopped.',
  'ask.insufficient': "I couldn't find that in your notes. Try other words or another subject.", 'ask.emptyTitle': 'Ask your notes',
  'ask.emptyHint': 'It only answers from what you wrote and cites where. Tap a citation to jump to the message.',
  'ask.ex1': 'What topics did we cover this week?', 'ask.ex2': 'Summarize the key points of the last class', 'ask.ex3': 'Explain the difference between the main concepts',
  'ask.sources': 'Sources ({n}) · {pct}% match', 'ask.closest': 'Closest I found ({n})', 'ask.jump': 'Jump to that message', 'ask.keyword': 'keyword',
  'ask.searchedFor': 'Searched: {q}', 'ask.renameChat': 'Rename chat', 'ask.deleteChat': 'Delete chat', 'ask.deleteChatMsg': 'Delete "{title}" and its messages?',
  'ask.chatDeleted': 'Chat deleted', 'ask.nMsgs': '{n} messages', 'ask.inSubject': 'Ask in this subject',
  'study.create': 'Create study material', 'study.summary': 'Summary', 'study.flashcards': 'Flashcards', 'study.quiz': 'Quiz',
  'study.summaryDesc': 'Key ideas, organized', 'study.flashcardsDesc': 'Question and answer to memorize', 'study.quizDesc': 'Multiple choice with explanations',
  'study.from': 'From', 'study.topic': 'Topic (optional)', 'study.topicPh': 'E.g. mitosis, Newton’s second law…', 'study.generate': 'Generate',
  'study.hint': 'Uses only what is in your notes.', 'study.generating': 'The AI is reading your notes…', 'study.ready': 'Ready', 'study.saved': 'Saved',
  'study.noneYet': 'Nothing generated here yet.', 'study.deleteTitle': 'Delete material',
  'study.partial': 'Your notes are long: part of them was used (starred first). Add a topic to focus it.',
  'study.question': 'Question', 'study.answer': 'Answer', 'study.prev': 'Previous', 'study.next': 'Next', 'study.gotIt': 'Got it',
  'study.shuffle': 'Shuffle', 'study.known': '{n} known', 'study.fcHint': 'Tap the card to flip it · ← → to move',
  'study.score': '{right} of {done} right · {total} questions', 'study.retry': 'Retry', 'study.thisNote': 'This note',
  'study.fromNote': 'Study this note', 'study.fromSubject': 'Study this subject',
  'import.title': 'Import WhatsApp chat', 'import.sub': 'Bring a chat (e.g. your class group) in as a note, with photos and audio.',
  'import.noteTitle': 'Note title', 'import.zipTab': '.zip file', 'import.txtTab': 'Paste text', 'import.chooseZip': 'Choose or drop the exported .zip',
  'import.zipHint': 'Photos are read by AI and audio is transcribed.', 'import.pastePh': 'Paste the exported text here…',
  'import.meName': 'Your name in that chat (optional)', 'import.meNamePh': 'So your messages go on the right',
  'import.howTo': 'In WhatsApp: open the chat → ⋮ → More → Export chat → Include media.', 'import.go': 'Import',
  'import.needZip': 'Choose the .zip', 'import.needText': 'Paste the exported text', 'import.done': '{n} messages imported',
  'import.doneZip': '{n} messages, {i} images and {a} audio files imported (processing…)',
  'account.title': 'Account', 'account.user': 'user', 'account.sessions': 'Open sessions',
  'account.sessionsSub': "Devices where your account is signed in. Close the ones you don't recognize.", 'account.thisDevice': 'this device',
  'account.lastSeen': 'active', 'account.since': 'since', 'account.closeSession': 'Close', 'account.closeOthers': 'Close all others',
  'account.closedN': '{n} session(s) closed', 'account.unknownDevice': 'Unknown device', 'account.password': 'Change password',
  'account.passwordSub': 'Your other sessions will be closed.', 'account.currentPassword': 'Current password',
  'account.passwordChanged': 'Password changed ({n} sessions closed)', 'account.export': 'Download everything (.zip)',
  'account.exporting': 'Preparing the download…', 'account.install': 'Install app', 'account.logout': 'Sign out', 'account.users': 'Users',
  'account.usersSub': 'Notebook accounts and system status.', 'account.newUser': 'New user', 'account.newUserSub': 'You share the username and password.',
  'account.userCreated': 'User created', 'account.reset': 'Password', 'account.resetTitle': 'New password for {name}',
  'account.resetSub': 'All their sessions will be closed.', 'account.resetDone': 'Password changed', 'account.deleteUser': 'Delete {name}',
  'account.deleteUserMsg': 'Their account and {n} notes with images and audio are deleted. This cannot be undone.', 'account.userDeleted': 'User deleted',
  'account.never': 'never signed in', 'account.models': 'Models', 'account.stNotes': 'notes', 'account.stMessages': 'messages',
  'account.stChunks': 'chunks', 'account.stPending': 'pending',
  'err.offline': 'Cannot reach the server', 'err.not_authenticated': 'Your session ended, sign in again', 'err.rate_limited': 'Too many requests, wait a moment',
  'err.csrf': 'Request rejected; reload the page', 'err.internal': 'Internal server error', 'err.file_too_large': 'File too large', 'err.too_large': 'Too large',
  'err.bad_id': 'Invalid id', 'err.bad_setup_token': 'Setup token is incorrect', 'err.bad_username': 'Invalid username (3-32: letters, numbers, . _ -)',
  'err.bad_password': 'Invalid password (min 8 characters)', 'err.bad_credentials': 'Wrong username or password',
  'err.bad_current_password': 'Current password is wrong', 'err.user_exists': 'That user already exists', 'err.cannot_delete_self': 'You cannot delete your own account',
  'err.note_not_found': 'Note not found', 'err.bad_subject': 'Invalid subject', 'err.subject_exists': 'You already have a subject with that name',
  'err.empty_title': 'Title cannot be empty', 'err.empty_message': 'Empty or too long message', 'err.bad_image': 'Unsupported format (use JPG, PNG, WebP or GIF)',
  'err.bad_audio': 'Unsupported audio format', 'err.no_messages': 'No WhatsApp messages found', 'err.bad_zip': 'That file is not a valid .zip',
  'err.zip_too_big': 'The .zip is too large', 'err.no_chat_txt': 'The chat .txt is not inside the .zip', 'err.too_many_messages': 'Too many messages',
  'err.import_too_big': 'Export too large (max 5 MB)', 'err.bad_question': 'Invalid question', 'err.ai_busy': 'The AI is busy, try again in a minute',
  'err.ai_error': 'The AI could not answer, try again', 'err.nothing_to_study': 'Nothing indexed to study there yet',
  'err.study_failed': 'The AI returned something unusable, try again', 'err.not_found': 'Not found',
};

const DICTS = { es: ES, en: EN };
let lang = (() => {
  try {
    const saved = localStorage.getItem('nb_lang');
    if (saved === 'es' || saved === 'en') return saved;
  } catch { /* sin storage */ }
  return /^es\b/i.test(navigator.language || '') ? 'es' : navigator.language ? 'en' : 'es';
})();
document.documentElement.lang = lang;

export const getLang = () => lang;
export const locale = () => (lang === 'es' ? 'es-BO' : 'en');

export function setLang(l) {
  lang = l === 'en' ? 'en' : 'es';
  document.documentElement.lang = lang;
  try { localStorage.setItem('nb_lang', lang); } catch { /* ok */ }
}

/** t('clave', { var }) → texto en el idioma actual (cae al español y luego a la clave) */
export function t(key, vars) {
  let s = DICTS[lang][key] ?? ES[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}

/** Mensaje de error traducido a partir del código del servidor */
export function errorText(code, fallback) {
  const k = 'err.' + code;
  return DICTS[lang][k] || ES[k] || fallback;
}

/** Botoncito ES | EN para la pantalla de login */
export function langSwitcher(onChange) {
  const box = document.createElement('div');
  box.className = 'lang-switch';
  for (const l of ['es', 'en']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l.toUpperCase();
    b.className = l === lang ? 'active' : '';
    b.onclick = () => { setLang(l); onChange?.(); };
    box.appendChild(b);
  }
  return box;
}
