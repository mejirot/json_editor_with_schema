// DOM要素
let schemaEditor, formContainer, jsonOutput, validationStatus;
let currentData = {};
let currentSchema = {};
let validationErrors = [];

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    schemaEditor = document.getElementById('schemaEditor');
    formContainer = document.getElementById('formContainer');
    jsonOutput = document.getElementById('jsonOutput');
    validationStatus = document.getElementById('validationStatus');
    
    // 初期フォーム生成
    generateForm();
    
    // スキーマ変更時の自動フォーム生成
    schemaEditor.addEventListener('input', debounce(generateForm, 500));
});

// デバウンス関数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// フォーム生成メイン関数
function generateForm() {
    try {
        const schemaText = schemaEditor.value.trim();
        if (!schemaText) {
            showEmptyForm();
            return;
        }
        
        const schema = JSON.parse(schemaText);
        currentSchema = schema;
        currentData = {};
        validationErrors = [];
        
        if (schema.type === 'object' && schema.properties) {
            const formHtml = generateObjectForm(schema, '', currentData);
            formContainer.innerHTML = formHtml;
            
            // イベントリスナーを設定
            setupEventListeners();
            updateJsonOutput();
            // 初期状態では手動バリデーションのメッセージを表示
            showValidationMessage();
        } else {
            showEmptyForm('オブジェクト型のスキーマのみサポートしています');
        }
    } catch (e) {
        showEmptyForm(`スキーマエラー: ${e.message}`);
    }
}

// オブジェクトフォーム生成
function generateObjectForm(schema, path, data, level = 0) {
    let html = '';
    const properties = schema.properties || {};
    const required = schema.required || [];
    
    for (const [key, propSchema] of Object.entries(properties)) {
        const fieldPath = path ? `${path}.${key}` : key;
        const isRequired = required.includes(key);
        const fieldId = `field_${fieldPath.replace(/\./g, '_')}`;
        
        html += '<div class="form-group">';
        html += `<label class="form-label" for="${fieldId}">`;
        html += escapeHtml(key);
        if (isRequired) {
            html += '<span class="required">*</span>';
        }
        if (propSchema.description) {
            html += `<span class="description">(${escapeHtml(propSchema.description)})</span>`;
        }
        html += '</label>';
        
        html += generateFieldByType(propSchema, fieldPath, fieldId, data[key]);
        html += '</div>';
    }
    
    return html;
}

// 型に応じたフィールド生成
function generateFieldByType(schema, path, fieldId, value) {
    const type = schema.type;
    
    switch (type) {
        case 'string':
            return generateStringField(schema, path, fieldId, value);
        case 'number':
        case 'integer':
            return generateNumberField(schema, path, fieldId, value);
        case 'boolean':
            return generateBooleanField(schema, path, fieldId, value);
        case 'object':
            return generateNestedObjectField(schema, path, fieldId, value);
        case 'array':
            return generateArrayField(schema, path, fieldId, value);
        default:
            return `<input type="text" class="form-control" id="${fieldId}" data-path="${path}" placeholder="不明な型: ${type}">`;
    }
}

// 文字列フィールド生成
function generateStringField(schema, path, fieldId, value = '') {
    if (schema.enum) {
        // 選択肢がある場合はセレクトボックス
        let html = `<select class="form-control form-select" id="${fieldId}" data-path="${path}">`;
        html += '<option value="">選択してください</option>';
        for (const option of schema.enum) {
            const selected = value === option ? 'selected' : '';
            html += `<option value="${escapeHtml(option)}" ${selected}>${escapeHtml(option)}</option>`;
        }
        html += '</select>';
        return html;
    } else if (schema.format === 'email') {
        // メールアドレス
        return `<input type="email" class="form-control" id="${fieldId}" data-path="${path}" value="${escapeHtml(value)}" placeholder="example@domain.com">`;
    } else if (schema.maxLength && schema.maxLength > 100) {
        // 長いテキストはテキストエリア
        return `<textarea class="form-control" id="${fieldId}" data-path="${path}" rows="3" placeholder="テキストを入力してください">${escapeHtml(value)}</textarea>`;
    } else {
        // 通常のテキスト入力
        const minLength = schema.minLength || '';
        const maxLength = schema.maxLength || '';
        const pattern = schema.pattern || '';
        
        return `<input type="text" class="form-control" id="${fieldId}" data-path="${path}" 
                value="${escapeHtml(value)}" 
                ${minLength ? `minlength="${minLength}"` : ''}
                ${maxLength ? `maxlength="${maxLength}"` : ''}
                ${pattern ? `pattern="${escapeHtml(pattern)}"` : ''}
                placeholder="テキストを入力してください">`;
    }
}

// 数値フィールド生成
function generateNumberField(schema, path, fieldId, value = '') {
    const min = schema.minimum !== undefined ? schema.minimum : '';
    const max = schema.maximum !== undefined ? schema.maximum : '';
    const step = schema.type === 'integer' ? '1' : 'any';
    
    return `<input type="number" class="form-control" id="${fieldId}" data-path="${path}" 
            value="${value}" 
            ${min !== '' ? `min="${min}"` : ''}
            ${max !== '' ? `max="${max}"` : ''}
            step="${step}"
            placeholder="数値を入力してください">`;
}

// ブール値フィールド生成
function generateBooleanField(schema, path, fieldId, value = false) {
    const checked = value === true ? 'checked' : '';
    
    return `<div class="checkbox-group">
                <input type="checkbox" id="${fieldId}" data-path="${path}" ${checked}>
                <label for="${fieldId}">有効にする</label>
            </div>`;
}

// ネストオブジェクトフィールド生成
function generateNestedObjectField(schema, path, fieldId, value = {}) {
    let html = `<div class="nested-object">`;
    html += `<h4>${escapeHtml(path.split('.').pop() || 'オブジェクト')}</h4>`;
    html += generateObjectForm(schema, path, value, 1);
    html += '</div>';
    return html;
}

// 配列フィールド生成
function generateArrayField(schema, path, fieldId, value = []) {
    let html = `<div class="array-container" data-path="${path}">`;
    html += `<div class="array-header">`;
    html += `<button type="button" class="btn btn-primary btn-sm" onclick="addArrayItem('${path}')">項目を追加</button>`;
    html += `</div>`;
    html += `<div id="array_${path.replace(/\./g, '_')}" class="array-items">`;
    
    // 既存の項目を表示
    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            html += generateArrayItem(schema.items, path, index, item);
        });
    }
    
    html += `</div>`;
    html += `</div>`;
    return html;
}

// 配列項目生成
function generateArrayItem(itemSchema, arrayPath, index, value) {
    const itemPath = `${arrayPath}[${index}]`;
    const itemId = `item_${itemPath.replace(/[\.\[\]]/g, '_')}`;
    
    let html = `<div class="array-item" data-index="${index}">`;
    html += `<div class="array-item-header">`;
    html += `<span>項目 ${index + 1}</span>`;
    html += `<button type="button" class="btn btn-danger btn-sm" onclick="removeArrayItem('${arrayPath}', ${index})">削除</button>`;
    html += `</div>`;
    html += generateFieldByType(itemSchema, itemPath, itemId, value);
    html += `</div>`;
    
    return html;
}

// イベントリスナー設定
function setupEventListeners() {
    const inputs = formContainer.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.addEventListener('input', handleInputChange);
        input.addEventListener('change', handleInputChange);
    });
}

// 入力変更ハンドラー
function handleInputChange(event) {
    const element = event.target;
    const path = element.dataset.path;
    let value = element.value;
    
    // 型に応じて値を変換
    if (element.type === 'checkbox') {
        value = element.checked;
    } else if (element.type === 'number') {
        if (value === '') {
            // 数値フィールドが空の場合は削除
            const keys = path.split(/[\.\[\]]/).filter(key => key !== '');
            let current = currentData;
            for (let i = 0; i < keys.length - 1; i++) {
                current = current[keys[i]];
            }
            delete current[keys[keys.length - 1]];
            updateJsonOutput();
            // 数値フィールドが空になってもバリデーション状態を保持
            return;
        } else {
            value = parseFloat(value);
        }
    }
    
    // データを更新
    setNestedValue(currentData, path, value);
    updateJsonOutput();
    // 入力時はバリデーション状態をクリアしない（結果を保持）
}

// ネストした値を設定
function setNestedValue(obj, path, value) {
    const keys = path.split(/[\.\[\]]/).filter(key => key !== '');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in current)) {
            current[key] = isNaN(keys[i + 1]) ? {} : [];
        }
        current = current[key];
    }
    
    const lastKey = keys[keys.length - 1];
    if (value === undefined) {
        delete current[lastKey];
    } else {
        current[lastKey] = value;
    }
}

// 配列項目追加
function addArrayItem(arrayPath) {
    const schema = getCurrentSchema();
    const arraySchema = getSchemaByPath(schema, arrayPath);
    
    if (arraySchema && arraySchema.items) {
        const arrayContainer = document.getElementById(`array_${arrayPath.replace(/\./g, '_')}`);
        const currentItems = arrayContainer.children.length;
        
        const newItemHtml = generateArrayItem(arraySchema.items, arrayPath, currentItems, getDefaultValue(arraySchema.items));
        arrayContainer.insertAdjacentHTML('beforeend', newItemHtml);
        
        // 新しい項目のイベントリスナーを設定
        setupEventListeners();
        
        // データを更新
        const currentArray = getNestedValue(currentData, arrayPath) || [];
        currentArray.push(getDefaultValue(arraySchema.items));
        setNestedValue(currentData, arrayPath, currentArray);
        updateJsonOutput();
        // 配列操作時もバリデーション状態を保持
    }
}

// 配列項目削除
function removeArrayItem(arrayPath, index) {
    const arrayContainer = document.getElementById(`array_${arrayPath.replace(/\./g, '_')}`);
    const items = arrayContainer.children;
    
    if (items[index]) {
        items[index].remove();
        
        // インデックスを再調整
        Array.from(items).forEach((item, newIndex) => {
            if (newIndex >= index) {
                item.dataset.index = newIndex;
                item.querySelector('.array-item-header span').textContent = `項目 ${newIndex + 1}`;
            }
        });
        
        // データを更新
        const currentArray = getNestedValue(currentData, arrayPath) || [];
        currentArray.splice(index, 1);
        setNestedValue(currentData, arrayPath, currentArray);
        updateJsonOutput();
        validateData();
    }
}

// ユーティリティ関数
function getCurrentSchema() {
    try {
        return JSON.parse(schemaEditor.value);
    } catch (e) {
        return {};
    }
}

function getSchemaByPath(schema, path) {
    const keys = path.split('.');
    let current = schema;
    
    for (const key of keys) {
        if (current.properties && current.properties[key]) {
            current = current.properties[key];
        } else {
            return null;
        }
    }
    
    return current;
}

function getNestedValue(obj, path) {
    const keys = path.split(/[\.\[\]]/).filter(key => key !== '');
    let current = obj;
    
    for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
            current = current[key];
        } else {
            return undefined;
        }
    }
    
    return current;
}

function getDefaultValue(schema) {
    switch (schema.type) {
        case 'string': return '';
        case 'number': return 0;
        case 'integer': return 0;
        case 'boolean': return false;
        case 'array': return [];
        case 'object': return {};
        default: return null;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showEmptyForm(message = 'スキーマを入力すると、GUIフォームが自動生成されます') {
    formContainer.innerHTML = `<div class="empty-form">${escapeHtml(message)}</div>`;
    currentData = {};
    currentSchema = {};
    validationErrors = [];
    updateJsonOutput();
    
    if (validationStatus) {
        validationStatus.className = 'validation-status validation-warning';
        validationStatus.textContent = 'バリデーション待機中...';
    }
}

// 手動バリデーション用メッセージ表示
function showValidationMessage() {
    if (validationStatus) {
        validationStatus.className = 'validation-status validation-warning';
        validationStatus.innerHTML = `
            <div class="validation-summary">
                <span>「バリデーション実行」ボタンを押してデータを検証してください</span>
            </div>
        `;
    }
}

function updateJsonOutput() {
    jsonOutput.value = JSON.stringify(currentData, null, 2);
}

// データバリデーション機能（手動実行）
function validateData() {
    console.log('validateData called');
    console.log('currentData:', currentData);
    console.log('currentSchema:', currentSchema);
    
    validationErrors = [];
    
    if (currentSchema && currentSchema.type === 'object') {
        validateObject(currentData, currentSchema, '');
    }
    
    console.log('validationErrors:', validationErrors);
    
    // UI更新
    updateValidationStatus();
    updateFieldValidationStyles();
}

// オブジェクトバリデーション
function validateObject(data, schema, path) {
    const properties = schema.properties || {};
    const required = schema.required || [];
    
    // 必須項目チェック
    for (const requiredField of required) {
        const fieldPath = path ? `${path}.${requiredField}` : requiredField;
        const fieldValue = data[requiredField];
        const fieldSchema = properties[requiredField];
        
        // 値が存在しない、または空の場合（ただし boolean は除く）
        let isEmpty = false;
        if (fieldValue === undefined || fieldValue === null) {
            isEmpty = true;
        } else if (fieldSchema && fieldSchema.type === 'string' && fieldValue === '') {
            isEmpty = true;
        } else if (fieldSchema && fieldSchema.type === 'array' && Array.isArray(fieldValue) && fieldValue.length === 0) {
            isEmpty = true;
        }
        
        if (isEmpty) {
            validationErrors.push({
                path: fieldPath,
                field: requiredField,
                message: `${requiredField}は必須項目です`,
                type: 'required'
            });
        }
    }
    
    // 各プロパティのバリデーション
    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
        const fieldPath = path ? `${path}.${fieldName}` : fieldName;
        const fieldValue = data[fieldName];
        
        if (fieldValue !== undefined && fieldValue !== '' && fieldValue !== null) {
            validateField(fieldValue, fieldSchema, fieldPath, fieldName);
        }
    }
    
    // additionalProperties チェック
    if (schema.additionalProperties === false) {
        const allowedProps = Object.keys(properties);
        for (const prop of Object.keys(data)) {
            if (!allowedProps.includes(prop)) {
                const fieldPath = path ? `${path}.${prop}` : prop;
                validationErrors.push({
                    path: fieldPath,
                    field: prop,
                    message: `${prop}は許可されていないプロパティです`,
                    type: 'additionalProperties'
                });
            }
        }
    }
}

// フィールドバリデーション
function validateField(value, schema, path, fieldName) {
    const type = schema.type;
    
    // 型チェック
    const actualType = getJsonType(value);
    if (actualType !== type) {
        validationErrors.push({
            path: path,
            field: fieldName,
            message: `${fieldName}の型が正しくありません（期待: ${type}, 実際: ${actualType}）`,
            type: 'type'
        });
        return;
    }
    
    // 文字列バリデーション
    if (type === 'string') {
        if (schema.minLength && value.length < schema.minLength) {
            validationErrors.push({
                path: path,
                field: fieldName,
                message: `${fieldName}は最低${schema.minLength}文字必要です（現在: ${value.length}文字）`,
                type: 'minLength'
            });
        }
        
        if (schema.maxLength && value.length > schema.maxLength) {
            validationErrors.push({
                path: path,
                field: fieldName,
                message: `${fieldName}は最大${schema.maxLength}文字までです（現在: ${value.length}文字）`,
                type: 'maxLength'
            });
        }
        
        if (schema.pattern) {
            const regex = new RegExp(schema.pattern);
            if (!regex.test(value)) {
                validationErrors.push({
                    path: path,
                    field: fieldName,
                    message: `${fieldName}のパターンが正しくありません`,
                    type: 'pattern'
                });
            }
        }
        
        if (schema.format === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                validationErrors.push({
                    path: path,
                    field: fieldName,
                    message: `${fieldName}のメールアドレス形式が正しくありません`,
                    type: 'format'
                });
            }
        }
        
        if (schema.enum && !schema.enum.includes(value)) {
            validationErrors.push({
                path: path,
                field: fieldName,
                message: `${fieldName}は次の値のいずれかを選択してください: ${schema.enum.join(', ')}`,
                type: 'enum'
            });
        }
    }
    
    // 数値バリデーション
    if (type === 'number' || type === 'integer') {
        if (schema.minimum !== undefined && value < schema.minimum) {
            validationErrors.push({
                path: path,
                field: fieldName,
                message: `${fieldName}は${schema.minimum}以上である必要があります（現在: ${value}）`,
                type: 'minimum'
            });
        }
        
        if (schema.maximum !== undefined && value > schema.maximum) {
            validationErrors.push({
                path: path,
                field: fieldName,
                message: `${fieldName}は${schema.maximum}以下である必要があります（現在: ${value}）`,
                type: 'maximum'
            });
        }
        
        if (type === 'integer' && !Number.isInteger(value)) {
            validationErrors.push({
                path: path,
                field: fieldName,
                message: `${fieldName}は整数である必要があります`,
                type: 'integer'
            });
        }
    }
    
    // ネストオブジェクトバリデーション
    if (type === 'object' && typeof value === 'object' && value !== null) {
        validateObject(value, schema, path);
    }
    
    // 配列バリデーション
    if (type === 'array' && Array.isArray(value)) {
        if (schema.items) {
            value.forEach((item, index) => {
                const itemPath = `${path}[${index}]`;
                validateField(item, schema.items, itemPath, `${fieldName}[${index}]`);
            });
        }
        
        if (schema.uniqueItems) {
            const uniqueItems = new Set(value.map(item => JSON.stringify(item)));
            if (uniqueItems.size !== value.length) {
                validationErrors.push({
                    path: path,
                    field: fieldName,
                    message: `${fieldName}の配列要素は一意である必要があります`,
                    type: 'uniqueItems'
                });
            }
        }
    }
}

// バリデーションステータス更新
function updateValidationStatus() {
    console.log('updateValidationStatus called');
    console.log('validationStatus element:', validationStatus);
    console.log('validationErrors.length:', validationErrors.length);
    
    if (!validationStatus) return;
    
    const errorCount = validationErrors.length;
    
    if (errorCount === 0) {
        validationStatus.className = 'validation-status validation-valid';
        validationStatus.innerHTML = `
            <div class="validation-summary">
                <span>✓ OK - すべてのデータが有効です</span>
                <span class="validation-counts">エラー: 0</span>
            </div>
        `;
    } else {
        validationStatus.className = 'validation-status validation-invalid';
        
        const errorsByType = {};
        validationErrors.forEach(error => {
            if (!errorsByType[error.type]) {
                errorsByType[error.type] = [];
            }
            errorsByType[error.type].push(error);
        });
        
        let errorHtml = `
            <div class="validation-summary">
                <span>✗ ${errorCount}個のエラーが見つかりました</span>
                <span class="validation-counts">エラー: ${errorCount}</span>
            </div>
        `;
        
        if (errorCount <= 10) {
            errorHtml += '<ul class="error-list">';
            validationErrors.forEach(error => {
                errorHtml += `<li>${escapeHtml(error.message)}</li>`;
            });
            errorHtml += '</ul>';
        } else {
            errorHtml += '<ul class="error-list">';
            validationErrors.slice(0, 10).forEach(error => {
                errorHtml += `<li>${escapeHtml(error.message)}</li>`;
            });
            errorHtml += `<li>...その他 ${errorCount - 10} 個のエラー</li>`;
            errorHtml += '</ul>';
        }
        
        validationStatus.innerHTML = errorHtml;
    }
}

// フィールドバリデーションスタイル更新
function updateFieldValidationStyles() {
    // すべてのフィールドのスタイルをリセット
    const allFields = formContainer.querySelectorAll('input, select, textarea');
    allFields.forEach(field => {
        field.classList.remove('field-error', 'field-valid');
    });
    
    // エラーフィールドにスタイルを適用
    validationErrors.forEach(error => {
        const fieldId = `field_${error.path.replace(/[\.\[\]]/g, '_')}`;
        const field = document.getElementById(fieldId);
        if (field) {
            field.classList.add('field-error');
        }
    });
    
    // 有効なフィールドにスタイルを適用（値が入力されている場合）
    allFields.forEach(field => {
        const path = field.dataset.path;
        const hasError = validationErrors.some(error => error.path === path);
        
        if (!hasError && field.value !== '' && field.type !== 'checkbox') {
            field.classList.add('field-valid');
        } else if (!hasError && field.type === 'checkbox') {
            // チェックボックスは常に有効とみなす（エラーがない場合）
            field.classList.add('field-valid');
        }
    });
}

// サンプルスキーマ読み込み関数
function loadPersonSchema() {
    const schema = {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "minLength": 1,
                "description": "氏名"
            },
            "age": {
                "type": "number",
                "minimum": 0,
                "maximum": 150,
                "description": "年齢"
            },
            "email": {
                "type": "string",
                "format": "email",
                "description": "メールアドレス"
            },
            "isActive": {
                "type": "boolean",
                "description": "アクティブ状態"
            },
            "category": {
                "type": "string",
                "enum": ["student", "teacher", "admin"],
                "description": "カテゴリ"
            },
            "address": {
                "type": "object",
                "properties": {
                    "zipCode": {
                        "type": "string",
                        "pattern": "^[0-9]{3}-[0-9]{4}$",
                        "description": "郵便番号"
                    },
                    "prefecture": {
                        "type": "string",
                        "description": "都道府県"
                    },
                    "city": {
                        "type": "string",
                        "description": "市区町村"
                    }
                },
                "required": ["zipCode", "prefecture", "city"]
            },
            "hobbies": {
                "type": "array",
                "items": {
                    "type": "string"
                },
                "description": "趣味"
            }
        },
        "required": ["name", "email"],
        "additionalProperties": false
    };
    
    schemaEditor.value = JSON.stringify(schema, null, 2);
    generateForm();
}

function loadProductSchema() {
    const schema = {
        "type": "object",
        "properties": {
            "id": {
                "type": "string",
                "pattern": "^PRD-[0-9]{6}$",
                "description": "商品ID"
            },
            "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100,
                "description": "商品名"
            },
            "price": {
                "type": "number",
                "minimum": 0,
                "description": "価格"
            },
            "category": {
                "type": "string",
                "enum": ["electronics", "clothing", "books", "food"],
                "description": "カテゴリ"
            },
            "inStock": {
                "type": "boolean",
                "description": "在庫あり"
            },
            "tags": {
                "type": "array",
                "items": {
                    "type": "string"
                },
                "description": "タグ"
            },
            "specifications": {
                "type": "object",
                "properties": {
                    "weight": {
                        "type": "number",
                        "description": "重量(g)"
                    },
                    "dimensions": {
                        "type": "string",
                        "description": "寸法"
                    }
                }
            }
        },
        "required": ["id", "name", "price", "category"],
        "additionalProperties": false
    };
    
    schemaEditor.value = JSON.stringify(schema, null, 2);
    generateForm();
}

function loadConfigSchema() {
    const schema = {
        "type": "object",
        "properties": {
            "appName": {
                "type": "string",
                "minLength": 1,
                "description": "アプリケーション名"
            },
            "version": {
                "type": "string",
                "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$",
                "description": "バージョン"
            },
            "debug": {
                "type": "boolean",
                "description": "デバッグモード"
            },
            "database": {
                "type": "object",
                "properties": {
                    "host": {
                        "type": "string",
                        "description": "ホスト名"
                    },
                    "port": {
                        "type": "number",
                        "minimum": 1,
                        "maximum": 65535,
                        "description": "ポート番号"
                    },
                    "ssl": {
                        "type": "boolean",
                        "description": "SSL使用"
                    }
                },
                "required": ["host", "port"]
            },
            "features": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["authentication", "logging", "caching", "monitoring"]
                },
                "description": "有効な機能"
            }
        },
        "required": ["appName", "version", "database"],
        "additionalProperties": false
    };
    
    schemaEditor.value = JSON.stringify(schema, null, 2);
    generateForm();
}

function clearAll() {
    schemaEditor.value = '';
    showEmptyForm();
}

// JSONの型を取得する関数
function getJsonType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

// グローバル関数として確実に利用できるようにする
window.validateData = validateData;
window.generateForm = generateForm;
window.loadPersonSchema = loadPersonSchema;
window.loadProductSchema = loadProductSchema;
window.loadConfigSchema = loadConfigSchema;
window.clearAll = clearAll;
window.addArrayItem = addArrayItem;
window.removeArrayItem = removeArrayItem;