const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/ui/data-table.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Buscar y reemplazar el bloque
const oldBlock = `    // 🆕 CALLBACK PARA DRAG ENTRE TABS
    if (onDragStartCallback && rowSelection && data) {
      const selectedIds = Object.keys(rowSelection)
        .map(key => data[parseInt(key)]?.id_documento)
        .filter(id => id !== undefined);
      
      if (selectedIds.length > 0) {
        console.log('📤 [DraggableTableRow] Llamando onDragStart con:', selectedIds);
        onDragStartCallback(selectedIds);
      }
    }`;

const newBlock = `    // 🆕 CALLBACK PARA DRAG ENTRE TABS
    if (onDragStartCallback) {
      let selectedIds = [];
      
      // Si hay selección múltiple, usar esos IDs
      if (rowSelection && data && Object.keys(rowSelection).length > 0) {
        selectedIds = Object.keys(rowSelection)
          .map(key => data[parseInt(key)]?.id_documento)
          .filter(id => id !== undefined);
        console.log('📤 [DraggableTableRow] Arrastrando selección múltiple:', selectedIds);
      } 
      // Si no hay selección, usar solo el documento actual
      else {
        selectedIds = [doc.id_documento];
        console.log('📤 [DraggableTableRow] Arrastrando documento individual:', doc.id_documento);
      }
      
      if (selectedIds.length > 0) {
        onDragStartCallback(selectedIds);
      }
    }`;

if (content.includes(oldBlock)) {
    content = content.replace(oldBlock, newBlock);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Archivo actualizado correctamente');
} else {
    console.log('⚠️ No se encontró el bloque a reemplazar');
    console.log('Buscando variantes...');

    // Intentar encontrar el bloque ignorando diferencias de espacios/saltos de línea
    const normalizedOld = oldBlock.replace(/\s+/g, ' ').trim();
    const normalizedContent = content.replace(/\s+/g, ' ');

    if (normalizedContent.includes(normalizedOld)) {
        console.log('⚠️ El bloque existe pero con diferente formato de espacios');
    }
}
