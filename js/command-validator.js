// ============================================
// DROPLIT COMMAND VALIDATOR v1.0
// Каскадная валидация командных дропов
// 
// Архитектура:
//   Level 1: SYNTAX    — проверка структуры и форматов
//   Level 2: LOGIC     — логическая корректность
//   Level 3: CONTEXT   — соответствие запросу пользователя
//   Level 4: APPROVAL  — проверка необходимости верификации (stub)
//   Level 5: EXECUTION — финальная проверка перед выполнением (stub)
// 
// v1.0: Поддержка reminder command drops (scheduled, user related)
// Готов к расширению для action, assignment, management
// ============================================

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  
  const CONFIG = {
    // Допустимое отклонение времени от запроса (минуты)
    TIME_DEVIATION_THRESHOLD_MINUTES: 5,
    
    // Максимальный горизонт планирования (дни)
    MAX_SCHEDULE_DAYS_AHEAD: 365,
    
    // Максимальная длина title
    MAX_TITLE_LENGTH: 500,
    
    // Максимальная длина content
    MAX_CONTENT_LENGTH: 5000,
    
    // Включить подробное логирование
    VERBOSE_LOGGING: true,
    
    // Версия валидатора
    VERSION: '1.0.0'
  };

  // ============================================
  // VALIDATION RESULT STRUCTURE
  // ============================================
  
  /**
   * Создать объект результата валидации
   */
  function createValidationResult() {
    return {
      valid: true,
      blocked: false,
      blocked_at_level: null,
      errors: [],
      warnings: [],
      checks: [],
      approval_required: false,
      approval_reason: null,
      risk_score: 0,
      metadata: {
        validator_version: CONFIG.VERSION,
        validated_at: new Date().toISOString(),
        levels_passed: []
      }
    };
  }

  /**
   * Добавить ошибку в результат
   */
  function addError(result, level, code, message, details = {}) {
    result.errors.push({
      level: level,
      code: code,
      message: message,
      details: details,
      timestamp: new Date().toISOString()
    });
    result.valid = false;
    result.blocked = true;
    result.blocked_at_level = level;
    
    if (CONFIG.VERBOSE_LOGGING) {
      console.error(`[Validator L${level}] ❌ ${code}: ${message}`, details);
    }
  }

  /**
   * Добавить предупреждение в результат
   */
  function addWarning(result, level, code, message, details = {}) {
    result.warnings.push({
      level: level,
      code: code,
      message: message,
      details: details
    });
    
    // Увеличиваем risk score за каждое предупреждение
    result.risk_score += 5;
    
    if (CONFIG.VERBOSE_LOGGING) {
      console.warn(`[Validator L${level}] ⚠️ ${code}: ${message}`, details);
    }
  }

  /**
   * Добавить успешную проверку
   */
  function addCheck(result, level, name, details = {}) {
    result.checks.push({
      level: level,
      name: name,
      status: 'PASS',
      details: details
    });
    
    if (CONFIG.VERBOSE_LOGGING) {
      console.log(`[Validator L${level}] ✓ ${name}`, details);
    }
  }

  // ============================================
  // LEVEL 1: SYNTAX VALIDATOR
  // Проверка структуры и форматов
  // ============================================
  
  const Level1_Syntax = {
    name: 'SYNTAX',
    level: 1,
    
    /**
     * Выполнить все проверки уровня 1
     */
    validate(command, result) {
      console.log('[Validator] === Level 1: SYNTAX ===');
      
      // 1.1 Обязательные поля
      this.checkRequiredFields(command, result);
      if (result.blocked) return result;
      
      // 1.2 Форматы данных
      this.checkDataFormats(command, result);
      if (result.blocked) return result;
      
      // 1.3 Допустимые значения enum
      this.checkEnumValues(command, result);
      if (result.blocked) return result;
      
      // 1.4 Длина строк
      this.checkStringLengths(command, result);
      if (result.blocked) return result;
      
      result.metadata.levels_passed.push(1);
      return result;
    },
    
    /**
     * 1.1 Проверка обязательных полей
     */
    checkRequiredFields(command, result) {
      const required = [
        { field: 'title', label: 'Заголовок' },
        { field: 'scheduled_at', label: 'Время выполнения' },
        { field: 'action_type', label: 'Тип действия' },
        { field: 'sense_type', label: 'Тип команды' }
      ];
      
      const missing = [];
      
      for (const req of required) {
        const value = command[req.field];
        if (value === undefined || value === null || value === '') {
          missing.push(req.label);
        }
      }
      
      if (missing.length > 0) {
        addError(result, 1, 'MISSING_REQUIRED_FIELDS', 
          `Отсутствуют обязательные поля: ${missing.join(', ')}`,
          { missing_fields: missing }
        );
        return;
      }
      
      addCheck(result, 1, 'REQUIRED_FIELDS', { checked: required.length });
    },
    
    /**
     * 1.2 Проверка форматов данных
     */
    checkDataFormats(command, result) {
      // Проверка формата времени (ISO 8601)
      if (command.scheduled_at) {
        const date = new Date(command.scheduled_at);
        if (isNaN(date.getTime())) {
          addError(result, 1, 'INVALID_DATE_FORMAT',
            'Некорректный формат времени',
            { value: command.scheduled_at, expected: 'ISO 8601' }
          );
          return;
        }
      }
      
      // Проверка user_id (UUID формат)
      if (command.user_id) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(command.user_id)) {
          addError(result, 1, 'INVALID_USER_ID_FORMAT',
            'Некорректный формат user_id',
            { value: command.user_id, expected: 'UUID' }
          );
          return;
        }
      }
      
      addCheck(result, 1, 'DATA_FORMATS');
    },
    
    /**
     * 1.3 Проверка допустимых значений enum полей
     */
    checkEnumValues(command, result) {
      // Допустимые sense_type
      const validSenseTypes = ['reminder', 'assignment', 'action', 'management'];
      if (command.sense_type && !validSenseTypes.includes(command.sense_type)) {
        addError(result, 1, 'INVALID_SENSE_TYPE',
          `Недопустимый тип команды: ${command.sense_type}`,
          { value: command.sense_type, allowed: validSenseTypes }
        );
        return;
      }
      
      // Допустимые runtime_type
      const validRuntimeTypes = ['instant', 'scheduled', 'scripted'];
      if (command.runtime_type && !validRuntimeTypes.includes(command.runtime_type)) {
        addError(result, 1, 'INVALID_RUNTIME_TYPE',
          `Недопустимый тип выполнения: ${command.runtime_type}`,
          { value: command.runtime_type, allowed: validRuntimeTypes }
        );
        return;
      }
      
      // Допустимые relation_type
      const validRelationTypes = ['user', 'system'];
      if (command.relation_type && !validRelationTypes.includes(command.relation_type)) {
        addError(result, 1, 'INVALID_RELATION_TYPE',
          `Недопустимый тип связи: ${command.relation_type}`,
          { value: command.relation_type, allowed: validRelationTypes }
        );
        return;
      }
      
      // Допустимые action_type
      const validActionTypes = ['push', 'email', 'telegram', 'webhook', 'tts', 'sms'];
      if (command.action_type && !validActionTypes.includes(command.action_type)) {
        addWarning(result, 1, 'UNKNOWN_ACTION_TYPE',
          `Неизвестный тип действия: ${command.action_type}`,
          { value: command.action_type, known: validActionTypes }
        );
        // Warning, не error — новые типы могут добавляться
      }
      
      // Допустимые status
      const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled', 'failed', 'awaiting_approval'];
      if (command.status && !validStatuses.includes(command.status)) {
        addError(result, 1, 'INVALID_STATUS',
          `Недопустимый статус: ${command.status}`,
          { value: command.status, allowed: validStatuses }
        );
        return;
      }
      
      addCheck(result, 1, 'ENUM_VALUES');
    },
    
    /**
     * 1.4 Проверка длины строк
     */
    checkStringLengths(command, result) {
      if (command.title && command.title.length > CONFIG.MAX_TITLE_LENGTH) {
        addError(result, 1, 'TITLE_TOO_LONG',
          `Заголовок слишком длинный (${command.title.length} символов)`,
          { length: command.title.length, max: CONFIG.MAX_TITLE_LENGTH }
        );
        return;
      }
      
      if (command.content && command.content.length > CONFIG.MAX_CONTENT_LENGTH) {
        addError(result, 1, 'CONTENT_TOO_LONG',
          `Содержимое слишком длинное (${command.content.length} символов)`,
          { length: command.content.length, max: CONFIG.MAX_CONTENT_LENGTH }
        );
        return;
      }
      
      addCheck(result, 1, 'STRING_LENGTHS');
    }
  };

  // ============================================
  // LEVEL 2: LOGIC VALIDATOR
  // Логическая корректность
  // ============================================
  
  const Level2_Logic = {
    name: 'LOGIC',
    level: 2,
    
    /**
     * Выполнить все проверки уровня 2
     */
    validate(command, result) {
      console.log('[Validator] === Level 2: LOGIC ===');
      
      // 2.1 Время в будущем (для scheduled)
      this.checkTimeInFuture(command, result);
      if (result.blocked) return result;
      
      // 2.2 Разумный горизонт планирования
      this.checkScheduleHorizon(command, result);
      if (result.blocked) return result;
      
      // 2.3 Согласованность creator/acceptor/controller
      this.checkActorConsistency(command, result);
      if (result.blocked) return result;
      
      // 2.4 Согласованность sense_type и runtime_type
      this.checkTypeConsistency(command, result);
      if (result.blocked) return result;
      
      result.metadata.levels_passed.push(2);
      return result;
    },
    
    /**
     * 2.1 Проверка что время в будущем
     */
    checkTimeInFuture(command, result) {
      // Только для scheduled и scripted
      if (command.runtime_type === 'instant') {
        addCheck(result, 2, 'TIME_IN_FUTURE', { skipped: true, reason: 'instant command' });
        return;
      }
      
      const scheduledAt = new Date(command.scheduled_at);
      const now = new Date();
      
      // Допускаем небольшую погрешность (30 секунд в прошлое)
      const tolerance = 30 * 1000; // 30 секунд
      
      if (scheduledAt.getTime() < now.getTime() - tolerance) {
        addError(result, 2, 'TIME_IN_PAST',
          'Время выполнения в прошлом',
          { 
            scheduled_at: command.scheduled_at, 
            now: now.toISOString(),
            diff_seconds: Math.round((now.getTime() - scheduledAt.getTime()) / 1000)
          }
        );
        return;
      }
      
      addCheck(result, 2, 'TIME_IN_FUTURE', { 
        scheduled_at: command.scheduled_at,
        seconds_from_now: Math.round((scheduledAt.getTime() - now.getTime()) / 1000)
      });
    },
    
    /**
     * 2.2 Проверка разумного горизонта планирования
     */
    checkScheduleHorizon(command, result) {
      if (command.runtime_type === 'instant') {
        addCheck(result, 2, 'SCHEDULE_HORIZON', { skipped: true });
        return;
      }
      
      const scheduledAt = new Date(command.scheduled_at);
      const now = new Date();
      const daysAhead = (scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysAhead > CONFIG.MAX_SCHEDULE_DAYS_AHEAD) {
        addError(result, 2, 'SCHEDULE_TOO_FAR',
          `Напоминание запланировано слишком далеко (${Math.round(daysAhead)} дней)`,
          { days_ahead: Math.round(daysAhead), max_days: CONFIG.MAX_SCHEDULE_DAYS_AHEAD }
        );
        return;
      }
      
      // Предупреждение для очень далёких напоминаний (>30 дней)
      if (daysAhead > 30) {
        addWarning(result, 2, 'SCHEDULE_FAR_AHEAD',
          `Напоминание запланировано на ${Math.round(daysAhead)} дней вперёд`,
          { days_ahead: Math.round(daysAhead) }
        );
      }
      
      addCheck(result, 2, 'SCHEDULE_HORIZON', { days_ahead: Math.round(daysAhead) });
    },
    
    /**
     * 2.3 Проверка согласованности участников
     */
    checkActorConsistency(command, result) {
      const validActors = ['user', 'aski', 'cortex', 'homer', 'system'];
      
      // Creator должен быть валидным
      if (command.creator && !validActors.includes(command.creator.toLowerCase())) {
        addWarning(result, 2, 'UNKNOWN_CREATOR',
          `Неизвестный создатель: ${command.creator}`,
          { value: command.creator, known: validActors }
        );
      }
      
      // Acceptor должен быть валидным
      if (command.acceptor && !validActors.includes(command.acceptor.toLowerCase())) {
        addWarning(result, 2, 'UNKNOWN_ACCEPTOR',
          `Неизвестный получатель: ${command.acceptor}`,
          { value: command.acceptor, known: validActors }
        );
      }
      
      addCheck(result, 2, 'ACTOR_CONSISTENCY');
    },
    
    /**
     * 2.4 Проверка согласованности типов
     */
    checkTypeConsistency(command, result) {
      // reminder обычно не бывает instant
      if (command.sense_type === 'reminder' && command.runtime_type === 'instant') {
        addWarning(result, 2, 'UNUSUAL_TYPE_COMBINATION',
          'Напоминание с мгновенным выполнением — необычная комбинация',
          { sense_type: command.sense_type, runtime_type: command.runtime_type }
        );
      }
      
      // management обычно scripted
      if (command.sense_type === 'management' && command.runtime_type !== 'scripted') {
        addWarning(result, 2, 'MANAGEMENT_NOT_SCRIPTED',
          'Управляющая команда без сценария',
          { sense_type: command.sense_type, runtime_type: command.runtime_type }
        );
      }
      
      addCheck(result, 2, 'TYPE_CONSISTENCY');
    }
  };

  // ============================================
  // LEVEL 3: CONTEXT VALIDATOR
  // Соответствие запросу пользователя
  // ============================================
  
  const Level3_Context = {
    name: 'CONTEXT',
    level: 3,
    
    /**
     * Выполнить все проверки уровня 3
     */
    validate(command, userRequest, result) {
      console.log('[Validator] === Level 3: CONTEXT ===');
      
      // Если нет оригинального запроса — пропускаем контекстную валидацию
      if (!userRequest) {
        addCheck(result, 3, 'CONTEXT_VALIDATION', { skipped: true, reason: 'no user request' });
        result.metadata.levels_passed.push(3);
        return result;
      }
      
      // 3.1 Проверка отклонения времени от запроса
      this.checkTimeDeviation(command, userRequest, result);
      if (result.blocked) return result;
      
      // 3.2 Проверка соответствия содержания
      this.checkContentRelevance(command, userRequest, result);
      if (result.blocked) return result;
      
      result.metadata.levels_passed.push(3);
      return result;
    },
    
    /**
     * 3.1 Проверка отклонения времени от запроса
     */
    checkTimeDeviation(command, userRequest, result) {
      // Парсим время из запроса пользователя
      const requestedTime = this.parseTimeFromRequest(userRequest);
      
      if (!requestedTime) {
        addCheck(result, 3, 'TIME_DEVIATION', { 
          skipped: true, 
          reason: 'cannot parse time from request' 
        });
        return;
      }
      
      const scheduledAt = new Date(command.scheduled_at);
      const deviationMs = Math.abs(scheduledAt.getTime() - requestedTime.getTime());
      const deviationMinutes = deviationMs / 60000;
      
      if (deviationMinutes > CONFIG.TIME_DEVIATION_THRESHOLD_MINUTES) {
        addError(result, 3, 'TIME_DEVIATION_EXCEEDED',
          `Отклонение времени ${Math.round(deviationMinutes)} мин превышает порог ${CONFIG.TIME_DEVIATION_THRESHOLD_MINUTES} мин`,
          {
            requested: requestedTime.toISOString(),
            created: command.scheduled_at,
            deviation_minutes: Math.round(deviationMinutes),
            threshold_minutes: CONFIG.TIME_DEVIATION_THRESHOLD_MINUTES
          }
        );
        return;
      }
      
      // Увеличиваем risk score пропорционально отклонению
      result.risk_score += Math.round(deviationMinutes);
      
      addCheck(result, 3, 'TIME_DEVIATION', {
        deviation_minutes: Math.round(deviationMinutes * 10) / 10,
        threshold_minutes: CONFIG.TIME_DEVIATION_THRESHOLD_MINUTES
      });
    },
    
    /**
     * 3.2 Проверка релевантности содержания
     */
    checkContentRelevance(command, userRequest, result) {
      // Простая проверка: есть ли общие значимые слова
      const requestWords = this.extractSignificantWords(userRequest);
      const titleWords = this.extractSignificantWords(command.title || '');
      
      if (requestWords.length === 0 || titleWords.length === 0) {
        addCheck(result, 3, 'CONTENT_RELEVANCE', { skipped: true });
        return;
      }
      
      // Ищем пересечение
      const commonWords = requestWords.filter(w => titleWords.includes(w));
      const relevanceScore = commonWords.length / Math.max(requestWords.length, 1);
      
      if (relevanceScore < 0.1 && requestWords.length > 3) {
        addWarning(result, 3, 'LOW_CONTENT_RELEVANCE',
          'Заголовок команды мало соответствует запросу',
          {
            request_words: requestWords.slice(0, 10),
            title_words: titleWords.slice(0, 10),
            common_words: commonWords,
            relevance_score: Math.round(relevanceScore * 100) + '%'
          }
        );
      }
      
      addCheck(result, 3, 'CONTENT_RELEVANCE', {
        relevance_score: Math.round(relevanceScore * 100) + '%'
      });
    },
    
    /**
     * Парсинг времени из запроса пользователя
     */
    parseTimeFromRequest(request) {
      if (!request) return null;
      
      const now = new Date();
      const text = request.toLowerCase();
      
      // "через X минут"
      const minutesMatch = text.match(/через\s+(\d+)\s*минут/);
      if (minutesMatch) {
        const minutes = parseInt(minutesMatch[1]);
        return new Date(now.getTime() + minutes * 60000);
      }
      
      // "через полчаса"
      if (text.includes('через полчаса') || text.includes('через пол часа')) {
        return new Date(now.getTime() + 30 * 60000);
      }
      
      // "через час"
      if (text.match(/через\s+час\b/)) {
        return new Date(now.getTime() + 60 * 60000);
      }
      
      // "через X часов"
      const hoursMatch = text.match(/через\s+(\d+)\s*час/);
      if (hoursMatch) {
        const hours = parseInt(hoursMatch[1]);
        return new Date(now.getTime() + hours * 3600000);
      }
      
      // "в HH:MM" или "в H:MM"
      const timeMatch = text.match(/в\s+(\d{1,2})[:\.](\d{2})/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const target = new Date(now);
        target.setHours(hours, minutes, 0, 0);
        // Если время уже прошло сегодня — значит завтра
        if (target <= now) {
          target.setDate(target.getDate() + 1);
        }
        return target;
      }
      
      // "завтра в HH:MM"
      const tomorrowMatch = text.match(/завтра\s+в?\s*(\d{1,2})[:\.]?(\d{2})?/);
      if (tomorrowMatch) {
        const hours = parseInt(tomorrowMatch[1]);
        const minutes = parseInt(tomorrowMatch[2] || '0');
        const target = new Date(now);
        target.setDate(target.getDate() + 1);
        target.setHours(hours, minutes, 0, 0);
        return target;
      }
      
      // "через N дней"
      const daysMatch = text.match(/через\s+(\d+)\s*дн/);
      if (daysMatch) {
        const days = parseInt(daysMatch[1]);
        const target = new Date(now);
        target.setDate(target.getDate() + days);
        return target;
      }
      
      return null;
    },
    
    /**
     * Извлечение значимых слов из текста
     */
    extractSignificantWords(text) {
      if (!text) return [];
      
      // Стоп-слова (не несут смысла)
      const stopWords = [
        'в', 'на', 'и', 'а', 'но', 'или', 'что', 'как', 'для', 'по', 'из', 'за', 'к',
        'мне', 'меня', 'мой', 'моя', 'моё', 'мои', 'себе', 'себя',
        'это', 'эти', 'этот', 'эта', 'то', 'тот', 'та', 'те',
        'через', 'после', 'перед', 'до', 'от', 'у', 'о', 'об',
        'напомни', 'напомнить', 'напоминание', 'создай', 'сделай',
        'пожалуйста', 'нужно', 'надо', 'хочу', 'буду'
      ];
      
      return text
        .toLowerCase()
        .replace(/[^\wа-яё\s]/gi, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.includes(word));
    }
  };

  // ============================================
  // LEVEL 4: APPROVAL GATE (STUB)
  // Проверка необходимости верификации
  // ============================================
  
  const Level4_Approval = {
    name: 'APPROVAL',
    level: 4,
    
    /**
     * Проверить необходимость approval
     * v1.0: Базовая логика, готова к расширению
     */
    validate(command, result) {
      console.log('[Validator] === Level 4: APPROVAL ===');
      
      // Определяем требуется ли approval
      const approvalRequired = this.checkApprovalRequired(command);
      
      if (approvalRequired.required) {
        result.approval_required = true;
        result.approval_reason = approvalRequired.reason;
        
        addCheck(result, 4, 'APPROVAL_CHECK', {
          required: true,
          reason: approvalRequired.reason,
          verifier: approvalRequired.verifier
        });
        
        // Если approval требуется — команда не блокируется,
        // но переходит в статус awaiting_approval
        // Это обрабатывается на уровне executor
      } else {
        addCheck(result, 4, 'APPROVAL_CHECK', { required: false });
      }
      
      result.metadata.levels_passed.push(4);
      return result;
    },
    
    /**
     * Определить требуется ли верификация
     */
    checkApprovalRequired(command) {
      // v1.0: Approval требуется для:
      // 1. management команд
      // 2. action с цепочкой действий
      // 3. assignment (отправка другим)
      // 4. Финансовые операции (будущее)
      
      // Management всегда требует approval
      if (command.sense_type === 'management') {
        return {
          required: true,
          reason: 'Management команды требуют подтверждения',
          verifier: 'user'
        };
      }
      
      // Assignment требует approval от acceptor
      if (command.sense_type === 'assignment') {
        return {
          required: true,
          reason: 'Поручения требуют подтверждения',
          verifier: command.acceptor || 'user'
        };
      }
      
      // Action с webhook может требовать approval
      if (command.sense_type === 'action' && command.action_type === 'webhook') {
        return {
          required: true,
          reason: 'Webhook-действия требуют подтверждения',
          verifier: 'user'
        };
      }
      
      // Reminder обычно не требует approval
      if (command.sense_type === 'reminder') {
        return { required: false };
      }
      
      // По умолчанию — не требуется
      return { required: false };
    }
  };

  // ============================================
  // LEVEL 5: EXECUTION GUARD (STUB)
  // Финальная проверка перед выполнением
  // ============================================
  
  const Level5_Execution = {
    name: 'EXECUTION',
    level: 5,
    
    /**
     * Финальная проверка
     * v1.0: Логирование и создание checkpoint
     */
    validate(command, result) {
      console.log('[Validator] === Level 5: EXECUTION ===');
      
      // 5.1 Создаём execution log
      const executionLog = {
        command_id: command.id || 'pending',
        command_title: command.title,
        command_type: `${command.sense_type}/${command.runtime_type}`,
        validation_passed: result.valid,
        risk_score: result.risk_score,
        approval_required: result.approval_required,
        checked_at: new Date().toISOString(),
        checks_count: result.checks.length,
        warnings_count: result.warnings.length
      };
      
      // Сохраняем в localStorage для аудита
      this.saveExecutionLog(executionLog);
      
      addCheck(result, 5, 'EXECUTION_LOGGED', { log_id: executionLog.checked_at });
      
      result.metadata.levels_passed.push(5);
      result.metadata.execution_log = executionLog;
      
      return result;
    },
    
    /**
     * Сохранить лог выполнения
     */
    saveExecutionLog(log) {
      try {
        const logs = JSON.parse(localStorage.getItem('droplit_validator_logs') || '[]');
        logs.push(log);
        
        // Храним последние 100 логов
        if (logs.length > 100) {
          logs.splice(0, logs.length - 100);
        }
        
        localStorage.setItem('droplit_validator_logs', JSON.stringify(logs));
      } catch (e) {
        console.warn('[Validator] Could not save execution log:', e);
      }
    }
  };

  // ============================================
  // MAIN VALIDATOR API
  // ============================================
  
  const CommandValidator = {
    
    /**
     * Полная валидация команды через все уровни
     * 
     * @param {Object} command - Команда для валидации
     * @param {string} userRequest - Оригинальный запрос пользователя (опционально)
     * @param {Object} options - Опции валидации
     * @returns {Object} Результат валидации
     */
    validate(command, userRequest = null, options = {}) {
      console.log('[Validator] ========================================');
      console.log('[Validator] Starting validation for:', command.title || 'untitled');
      console.log('[Validator] ========================================');
      
      const result = createValidationResult();
      
      // Сохраняем входные данные для отчёта
      result.metadata.command_title = command.title;
      result.metadata.user_request = userRequest;
      
      try {
        // Level 1: Syntax
        Level1_Syntax.validate(command, result);
        if (result.blocked) return this.finalize(result);
        
        // Level 2: Logic
        Level2_Logic.validate(command, result);
        if (result.blocked) return this.finalize(result);
        
        // Level 3: Context (если есть запрос пользователя)
        Level3_Context.validate(command, userRequest, result);
        if (result.blocked) return this.finalize(result);
        
        // Level 4: Approval
        Level4_Approval.validate(command, result);
        
        // Level 5: Execution guard
        Level5_Execution.validate(command, result);
        
      } catch (error) {
        addError(result, 0, 'VALIDATOR_ERROR',
          'Внутренняя ошибка валидатора',
          { error: error.message }
        );
      }
      
      return this.finalize(result);
    },
    
    /**
     * Быстрая валидация (только уровни 1-2)
     * Для мгновенных проверок без контекста
     */
    quickValidate(command) {
      const result = createValidationResult();
      
      Level1_Syntax.validate(command, result);
      if (!result.blocked) {
        Level2_Logic.validate(command, result);
      }
      
      return this.finalize(result);
    },
    
    /**
     * Финализация результата
     */
    finalize(result) {
      // Итоговый статус
      result.metadata.completed_at = new Date().toISOString();
      result.metadata.total_checks = result.checks.length;
      result.metadata.total_errors = result.errors.length;
      result.metadata.total_warnings = result.warnings.length;
      
      // Risk level
      if (result.risk_score < 10) {
        result.risk_level = 'low';
      } else if (result.risk_score < 30) {
        result.risk_level = 'medium';
      } else {
        result.risk_level = 'high';
      }
      
      // Логируем итог
      if (result.valid) {
        console.log(`[Validator] ✅ PASSED (${result.checks.length} checks, risk: ${result.risk_level})`);
      } else {
        console.log(`[Validator] ❌ BLOCKED at Level ${result.blocked_at_level}: ${result.errors[0]?.code}`);
      }
      
      return result;
    },
    
    /**
     * Форматировать результат для пользователя
     */
    formatForUser(result) {
      if (result.valid && !result.approval_required) {
        return `✅ Проверено: ${result.checks.length} проверок пройдено`;
      }
      
      if (result.valid && result.approval_required) {
        return `⏳ Требуется подтверждение: ${result.approval_reason}`;
      }
      
      // Форматируем ошибки
      const errorMessages = result.errors.map(e => `• ${e.message}`).join('\n');
      return `❌ Отказано:\n${errorMessages}`;
    },
    
    /**
     * Форматировать краткий отчёт
     */
    formatBriefReport(result) {
      const status = result.valid ? '✅ PASS' : '❌ BLOCK';
      const levels = result.metadata.levels_passed.join('→') || 'none';
      const risk = `risk:${result.risk_score}`;
      
      return `[Validator] ${status} | Levels: ${levels} | ${risk}`;
    },
    
    /**
     * Получить логи валидаций
     */
    getLogs() {
      try {
        return JSON.parse(localStorage.getItem('droplit_validator_logs') || '[]');
      } catch (e) {
        return [];
      }
    },
    
    /**
     * Очистить логи
     */
    clearLogs() {
      localStorage.removeItem('droplit_validator_logs');
    },
    
    /**
     * Конфигурация
     */
    config: CONFIG,
    
    /**
     * Версия
     */
    version: CONFIG.VERSION
  };

  // ============================================
  // EXPOSE GLOBAL API
  // ============================================
  
  window.CommandValidator = CommandValidator;
  
  console.log(`[CommandValidator] Module loaded v${CONFIG.VERSION}`);
  console.log('[CommandValidator] Levels: SYNTAX → LOGIC → CONTEXT → APPROVAL → EXECUTION');

})();
