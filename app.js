// DOM要素
let schemaEditor, jsonEditor, validationStatus;

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

// シンプルなJSON検証関数
function validateJson() {
    try {
        // スキーマをパース
        const schemaText = schemaEditor.value.trim();
        if (!schemaText) {
            updateValidationStatus('warning', 'スキーマが入力されていません。');
            return;
        }

        let schema;
        try {
            schema = JSON.parse(schemaText);
        } catch (e) {
            updateValidationStatus('invalid', `スキーマのJSONが無効です: ${e.message}`);
            return;
        }

        // JSONデータをパース
        const jsonText = jsonEditor.value.trim();
        if (!jsonText) {
            updateValidationStatus('warning', 'JSONデータが入力されていません。');
            return;
        }

        let data;
        try {
            data = JSON.parse(jsonText);
        } catch (e) {
            updateValidationStatus('invalid', `JSONデータが無効です: ${e.message}`);
            return;
        }

        // シンプルな検証実行
        const validationResult = validateAgainstSchema(data, schema);
        
        if (validationResult.valid) {
            updateValidationStatus('valid', '✓ JSONデータはスキーマに適合しています。');
        } else {
            updateValidationStatus('invalid', `✗ 検証エラー:\n${validationResult.errors.join('\n')}`);
        }
    } catch (e) {
        updateValidationStatus('invalid', `予期しないエラーが発生しました: ${e.message}`);
    }
}

// $ref参照を解決する関数
function resolveRef(ref, rootSchema) {
    if (!ref.startsWith('#/')) {
        return null; // 外部参照は未対応
    }
    
    const path = ref.substring(2).split('/'); // #/ を除去してパス分割
    let current = rootSchema;
    
    for (const segment of path) {
        if (current && typeof current === 'object' && segment in current) {
            current = current[segment];
        } else {
            return null; // 参照先が見つからない
        }
    }
    
    return current;
}

// シンプルなスキーマ検証関数
function validateAgainstSchema(data, schema, path = '', rootSchema = null) {
    const errors = [];
    
    // ルートスキーマが指定されていない場合は現在のスキーマをルートとする
    if (rootSchema === null) {
        rootSchema = schema;
    }
    
    // $ref がある場合は参照を解決
    if (schema.$ref) {
        const resolvedSchema = resolveRef(schema.$ref, rootSchema);
        if (resolvedSchema) {
            return validateAgainstSchema(data, resolvedSchema, path, rootSchema);
        } else {
            errors.push(`${path || 'ルート'}: 参照 ${schema.$ref} が解決できません`);
            return { valid: false, errors };
        }
    }
    
    if (schema.type) {
        const actualType = getJsonType(data);
        if (actualType !== schema.type) {
            errors.push(`${path || 'ルート'}: 型は${schema.type}である必要があります（現在: ${actualType}）`);
            return { valid: false, errors };
        }
    }
    
    if (schema.type === 'object' && data !== null) {
        // required プロパティをチェック
        if (schema.required) {
            for (const requiredProp of schema.required) {
                if (!(requiredProp in data)) {
                    errors.push(`${path || 'ルート'}: ${requiredProp}は必須項目です`);
                }
            }
        }
        
        // プロパティの検証
        if (schema.properties) {
            for (const [prop, propSchema] of Object.entries(schema.properties)) {
                if (prop in data) {
                    const propPath = path ? `${path}.${prop}` : prop;
                    const propResult = validateAgainstSchema(data[prop], propSchema, propPath, rootSchema);
                    errors.push(...propResult.errors);
                }
            }
        }
        
        // additionalProperties のチェック
        if (schema.additionalProperties === false && schema.properties) {
            const allowedProps = Object.keys(schema.properties);
            for (const prop of Object.keys(data)) {
                if (!allowedProps.includes(prop)) {
                    errors.push(`${path || 'ルート'}: ${prop}は許可されていないプロパティです`);
                }
            }
        }
    }
    
    if (schema.type === 'string' && typeof data === 'string') {
        if (schema.minLength && data.length < schema.minLength) {
            errors.push(`${path || 'ルート'}: 最小文字数は${schema.minLength}文字です（現在: ${data.length}文字）`);
        }
        if (schema.maxLength && data.length > schema.maxLength) {
            errors.push(`${path || 'ルート'}: 最大文字数は${schema.maxLength}文字です（現在: ${data.length}文字）`);
        }
        if (schema.pattern) {
            const regex = new RegExp(schema.pattern);
            if (!regex.test(data)) {
                errors.push(`${path || 'ルート'}: パターン ${schema.pattern} にマッチしません`);
            }
        }
        if (schema.format === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(data)) {
                errors.push(`${path || 'ルート'}: メールアドレスの形式が正しくありません`);
            }
        }
    }
    
    if (schema.type === 'number' && typeof data === 'number') {
        if (schema.minimum !== undefined && data < schema.minimum) {
            errors.push(`${path || 'ルート'}: 最小値は${schema.minimum}です（現在: ${data}）`);
        }
        if (schema.maximum !== undefined && data > schema.maximum) {
            errors.push(`${path || 'ルート'}: 最大値は${schema.maximum}です（現在: ${data}）`);
        }
    }
    
    if (schema.enum && !schema.enum.includes(data)) {
        errors.push(`${path || 'ルート'}: 次の値のいずれかを選択してください: ${schema.enum.join(', ')}`);
    }
    
    if (schema.type === 'array' && Array.isArray(data)) {
        if (schema.items) {
            data.forEach((item, index) => {
                const itemPath = `${path || 'ルート'}[${index}]`;
                const itemResult = validateAgainstSchema(item, schema.items, itemPath, rootSchema);
                errors.push(...itemResult.errors);
            });
        }
        if (schema.uniqueItems && new Set(data.map(JSON.stringify)).size !== data.length) {
            errors.push(`${path || 'ルート'}: 配列の要素は一意である必要があります`);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// JSONの型を取得
function getJsonType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

// 検証ステータスを更新
function updateValidationStatus(type, message) {
    if (validationStatus) {
        validationStatus.className = `validation-status validation-${type}`;
        validationStatus.textContent = message;
    }
}

// JSON整形関数
function formatJson() {
    try {
        const jsonText = jsonEditor.value.trim();
        if (jsonText) {
            const parsed = JSON.parse(jsonText);
            jsonEditor.value = JSON.stringify(parsed, null, 2);
        }
        
        const schemaText = schemaEditor.value.trim();
        if (schemaText) {
            const parsed = JSON.parse(schemaText);
            schemaEditor.value = JSON.stringify(parsed, null, 2);
        }
        
        validateJson();
    } catch (e) {
        updateValidationStatus('invalid', `JSON整形エラー: ${e.message}`);
    }
}

// 全クリア関数
function clearAll() {
    if (schemaEditor && jsonEditor) {
        schemaEditor.value = '';
        jsonEditor.value = '';
        updateValidationStatus('warning', 'エディターがクリアされました。');
    }
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
            "address": {
                "type": "object",
                "properties": {
                    "zipCode": {
                        "type": "string",
                        "pattern": "^[0-9]{3}-[0-9]{4}$"
                    },
                    "prefecture": {
                        "type": "string"
                    },
                    "city": {
                        "type": "string"
                    }
                },
                "required": ["zipCode", "prefecture", "city"]
            }
        },
        "required": ["name", "email"],
        "additionalProperties": false
    };
    
    const data = {
        "name": "田中太郎",
        "age": 30,
        "email": "tanaka@example.com",
        "isActive": true,
        "address": {
            "zipCode": "123-4567",
            "prefecture": "東京都",
            "city": "渋谷区"
        }
    };
    
    if (schemaEditor && jsonEditor) {
        schemaEditor.value = JSON.stringify(schema, null, 2);
        jsonEditor.value = JSON.stringify(data, null, 2);
        validateJson();
    }
}

function loadProductSchema() {
    const schema = {
        "type": "object",
        "properties": {
            "id": {
                "type": "string",
                "pattern": "^PRD-[0-9]{6}$"
            },
            "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100
            },
            "price": {
                "type": "number",
                "minimum": 0
            },
            "category": {
                "type": "string",
                "enum": ["electronics", "clothing", "books", "food"]
            },
            "inStock": {
                "type": "boolean"
            },
            "tags": {
                "type": "array",
                "items": {
                    "type": "string"
                },
                "uniqueItems": true
            }
        },
        "required": ["id", "name", "price", "category"],
        "additionalProperties": false
    };
    
    const data = {
        "id": "PRD-123456",
        "name": "ワイヤレスヘッドフォン",
        "price": 9800,
        "category": "electronics",
        "inStock": true,
        "tags": ["音楽", "Bluetooth", "ノイズキャンセリング"]
    };
    
    if (schemaEditor && jsonEditor) {
        schemaEditor.value = JSON.stringify(schema, null, 2);
        jsonEditor.value = JSON.stringify(data, null, 2);
        validateJson();
    }
}

function loadConfigSchema() {
    const schema = {
        "type": "object",
        "properties": {
            "appName": {
                "type": "string",
                "minLength": 1
            },
            "version": {
                "type": "string",
                "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
            },
            "database": {
                "type": "object",
                "properties": {
                    "host": {
                        "type": "string"
                    },
                    "port": {
                        "type": "number",
                        "minimum": 1,
                        "maximum": 65535
                    },
                    "ssl": {
                        "type": "boolean"
                    }
                },
                "required": ["host", "port"]
            },
            "features": {
                "type": "array",
                "items": {
                    "type": "string"
                }
            },
            "debug": {
                "type": "boolean"
            }
        },
        "required": ["appName", "version", "database"],
        "additionalProperties": false
    };
    
    const data = {
        "appName": "MyWebApp",
        "version": "1.2.3",
        "database": {
            "host": "localhost",
            "port": 5432,
            "ssl": true
        },
        "features": ["authentication", "logging", "caching"],
        "debug": false
    };
    
    if (schemaEditor && jsonEditor) {
        schemaEditor.value = JSON.stringify(schema, null, 2);
        jsonEditor.value = JSON.stringify(data, null, 2);
        validateJson();
    }
}

function loadRefSchema() {
    const schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Organization with $ref",
        "type": "object",
        "definitions": {
            "address": {
                "type": "object",
                "properties": {
                    "street": {
                        "type": "string",
                        "description": "街道名"
                    },
                    "city": {
                        "type": "string",
                        "description": "市区町村"
                    },
                    "zipCode": {
                        "type": "string",
                        "pattern": "^[0-9]{3}-[0-9]{4}$",
                        "description": "郵便番号"
                    },
                    "country": {
                        "type": "string",
                        "enum": ["Japan", "USA", "UK", "Canada"],
                        "description": "国"
                    }
                },
                "required": ["street", "city", "zipCode", "country"]
            },
            "person": {
                "type": "object",
                "properties": {
                    "firstName": {
                        "type": "string",
                        "minLength": 1,
                        "description": "名"
                    },
                    "lastName": {
                        "type": "string",
                        "minLength": 1,
                        "description": "姓"
                    },
                    "email": {
                        "type": "string",
                        "format": "email",
                        "description": "メールアドレス"
                    },
                    "phone": {
                        "type": "string",
                        "pattern": "^[0-9-]+$",
                        "description": "電話番号"
                    },
                    "address": {
                        "$ref": "#/definitions/address"
                    }
                },
                "required": ["firstName", "lastName", "email"]
            }
        },
        "properties": {
            "companyName": {
                "type": "string",
                "minLength": 1,
                "description": "会社名"
            },
            "foundedYear": {
                "type": "number",
                "minimum": 1800,
                "maximum": 2024,
                "description": "設立年"
            },
            "headquarters": {
                "$ref": "#/definitions/address"
            },
            "ceo": {
                "$ref": "#/definitions/person"
            },
            "employees": {
                "type": "array",
                "items": {
                    "$ref": "#/definitions/person"
                },
                "description": "従業員リスト"
            },
            "branches": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "支店名"
                        },
                        "address": {
                            "$ref": "#/definitions/address"
                        },
                        "manager": {
                            "$ref": "#/definitions/person"
                        }
                    },
                    "required": ["name", "address"]
                },
                "description": "支店リスト"
            }
        },
        "required": ["companyName", "foundedYear", "headquarters", "ceo"]
    };
    
    const data = {
        "companyName": "テックコーポレーション株式会社",
        "foundedYear": 2010,
        "headquarters": {
            "street": "1-2-3 渋谷",
            "city": "渋谷区",
            "zipCode": "150-0002",
            "country": "Japan"
        },
        "ceo": {
            "firstName": "太郎",
            "lastName": "田中",
            "email": "tanaka.taro@techcorp.co.jp",
            "phone": "03-1234-5678",
            "address": {
                "street": "4-5-6 恵比寿",
                "city": "渋谷区",
                "zipCode": "150-0013",
                "country": "Japan"
            }
        },
        "employees": [
            {
                "firstName": "花子",
                "lastName": "佐藤",
                "email": "sato.hanako@techcorp.co.jp",
                "phone": "03-2345-6789",
                "address": {
                    "street": "7-8-9 新宿",
                    "city": "新宿区",
                    "zipCode": "160-0022",
                    "country": "Japan"
                }
            },
            {
                "firstName": "次郎",
                "lastName": "鈴木",
                "email": "suzuki.jiro@techcorp.co.jp",
                "phone": "03-3456-7890"
            }
        ],
        "branches": [
            {
                "name": "大阪支店",
                "address": {
                    "street": "1-1-1 梅田",
                    "city": "北区",
                    "zipCode": "530-0001",
                    "country": "Japan"
                },
                "manager": {
                    "firstName": "三郎",
                    "lastName": "高橋",
                    "email": "takahashi.saburo@techcorp.co.jp",
                    "phone": "06-1234-5678"
                }
            }
        ]
    };
    
    schemaEditor.value = JSON.stringify(schema, null, 2);
    jsonEditor.value = JSON.stringify(data, null, 2);
    validateJson();
}

// 初期化関数
function initializeApp() {
    console.log('Initializing app...');
    
    // DOM要素を取得
    schemaEditor = document.getElementById('schemaEditor');
    jsonEditor = document.getElementById('jsonEditor');
    validationStatus = document.getElementById('validationStatus');

    if (!schemaEditor || !jsonEditor || !validationStatus) {
        console.error('DOM elements not found');
        return;
    }

    console.log('DOM elements found, setting up event listeners...');

    // リアルタイム検証のイベントリスナーを設定
    schemaEditor.addEventListener('input', debounce(validateJson, 500));
    jsonEditor.addEventListener('input', debounce(validateJson, 500));

    // 初期検証実行
    validateJson();
    
    console.log('App initialized successfully');
}

// DOMが読み込まれた後に初期化
document.addEventListener('DOMContentLoaded', initializeApp);