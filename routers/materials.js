const express = require('express');
const router = express.Router();
const SteelMaterial = require('../models/SteelMaterial');

// ============================================
// 메모리 캐시 시스템
// ============================================
let materialsCache = {
  data: [], // 전체 데이터 배열
  bySpec: new Map(), // spec을 키로 하는 Map
  byId: new Map(), // _id를 키로 하는 Map
  lastSync: null, // 마지막 동기화 시간
  isLoaded: false // 초기 로드 완료 여부
};

// 캐시 초기화 함수
async function loadCacheFromDB() {
  try {
    console.log('📦 캐시 데이터 로딩 시작...');
    const materials = await SteelMaterial.find({}).lean();
    
    materialsCache.data = materials;
    materialsCache.bySpec.clear();
    materialsCache.byId.clear();
    
    materials.forEach(material => {
      materialsCache.bySpec.set(material.spec, material);
      materialsCache.byId.set(material._id.toString(), material);
    });
    
    materialsCache.lastSync = new Date();
    materialsCache.isLoaded = true;
    
    console.log(`✅ 캐시 로딩 완료: ${materials.length}개 항목`);
    return true;
  } catch (error) {
    console.error('❌ 캐시 로딩 실패:', error.message);
    materialsCache.isLoaded = false;
    return false;
  }
}

// 캐시에서 검색 함수
function searchInCache(query, page = 1, limit = 50, sort = 'spec', order = 'asc') {
  let results = [...materialsCache.data];
  
  // 검색 필터 적용
  if (query.spec) {
    const specRegex = new RegExp(query.spec, 'i');
    results = results.filter(m => specRegex.test(m.spec));
  }
  if (query.product) {
    const productRegex = new RegExp(query.product, 'i');
    results = results.filter(m => productRegex.test(m.product));
  }
  if (query.method_calc !== undefined) {
    results = results.filter(m => m.method_calc === parseInt(query.method_calc));
  }
  if (query.cat_product !== undefined) {
    results = results.filter(m => m.cat_product === parseInt(query.cat_product));
  }
  
  // 정렬
  const sortOrder = order === 'desc' ? -1 : 1;
  results.sort((a, b) => {
    const aVal = a[sort];
    const bVal = b[sort];
    if (aVal < bVal) return -1 * sortOrder;
    if (aVal > bVal) return 1 * sortOrder;
    return 0;
  });
  
  // 페이지네이션
  const total = results.length;
  // limit이 매우 크면 전체 데이터 반환 (페이지네이션 없음)
  if (limit >= 999999) {
    return {
      data: results,
      total,
      page: 1,
      limit: total,
      pages: 1
    };
  }
  
  const skip = (page - 1) * limit;
  const paginatedResults = results.slice(skip, skip + limit);
  
  return {
    data: paginatedResults,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit)
  };
}

// CREATE - 새 재료 생성
router.post('/', async (req, res) => {
  try {
    const { spec, wpm, product, method_calc, initial_length, trade_unit, cat_product } = req.body;
    
    // 필수 필드 검증
    if (!spec || wpm === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'spec과 wpm은 필수 필드입니다.' 
      });
    }

    // 중복 확인
    const existing = await SteelMaterial.findOne({ spec });
    if (existing) {
      return res.status(409).json({ 
        success: false, 
        error: '이미 존재하는 spec입니다.' 
      });
    }

    const material = new SteelMaterial({
      spec,
      wpm: parseFloat(wpm) || 0,
      product: product || '',
      method_calc: parseInt(method_calc) || 0,
      initial_length: parseFloat(initial_length) || 0,
      trade_unit: parseInt(trade_unit) || 0,
      cat_product: parseInt(cat_product) || 0
    });

    await material.save();
    
    // 캐시에 추가
    if (materialsCache.isLoaded) {
      const materialObj = material.toObject();
      materialsCache.data.push(materialObj);
      materialsCache.bySpec.set(materialObj.spec, materialObj);
      materialsCache.byId.set(materialObj._id.toString(), materialObj);
    }
    
    res.status(201).json({ 
      success: true, 
      message: '재료가 성공적으로 생성되었습니다.',
      data: material 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// READ - 전체 조회 (페이지네이션 및 검색 지원) - 캐시에서 반환
router.get('/', async (req, res) => {
  try {
    const startTime = Date.now(); // 성능 측정 시작
    const { 
      spec, 
      product, 
      method_calc,
      cat_product,
      page = 1, 
      limit, // limit이 없으면 전체 데이터 반환
      sort = 'spec',
      order = 'asc'
    } = req.query;
    
    // 캐시가 로드되지 않았으면 DB에서 직접 조회
    if (!materialsCache.isLoaded) {
      console.warn('⚠️  캐시가 로드되지 않아 DB에서 직접 조회합니다.');
      const query = {};
      
      if (spec) query.spec = { $regex: spec, $options: 'i' };
      if (product) query.product = { $regex: product, $options: 'i' };
      if (method_calc) query.method_calc = parseInt(method_calc);
      if (cat_product) query.cat_product = parseInt(cat_product);
      
      const sortOrder = order === 'desc' ? -1 : 1;
      const sortObj = { [sort]: sortOrder };
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const materials = await SteelMaterial.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort(sortObj);
      
      const total = await SteelMaterial.countDocuments(query);
      const duration = Date.now() - startTime;
      
      console.log(`📊 DB 조회 완료: ${materials.length}개 항목, ${duration}ms 소요`);
      
      return res.json({
        success: true,
        data: materials,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        fromCache: false,
        duration: `${duration}ms`
      });
    }
    
    // 캐시에서 검색
    const query = { spec, product, method_calc, cat_product };
    // limit이 없거나 0이면 전체 데이터 반환 (매우 큰 값으로 설정)
    const limitValue = limit ? parseInt(limit) : 999999;
    const result = searchInCache(query, parseInt(page), limitValue, sort, order);
    const duration = Date.now() - startTime;
    
    console.log(`⚡ 캐시에서 반환: ${result.data.length}개 항목 (요청: page=${page}, limit=${limit || '전체'}), ${duration}ms 소요 (캐시 크기: ${materialsCache.data.length}개)`);
    
    res.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.pages
      },
      fromCache: true,
      lastSync: materialsCache.lastSync,
      duration: `${duration}ms`,
      cacheSize: materialsCache.data.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// READ - 특정 재료 조회 (ID 또는 spec으로) - 캐시에서 반환
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 캐시에서 먼저 찾기
    if (materialsCache.isLoaded) {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
      const material = isObjectId 
        ? materialsCache.byId.get(id)
        : materialsCache.bySpec.get(id);
      
      if (material) {
        return res.json({ 
          success: true, 
          data: material,
          fromCache: true
        });
      }
    }
    
    // 캐시에 없으면 DB에서 조회
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const material = isObjectId 
      ? await SteelMaterial.findById(id)
      : await SteelMaterial.findOne({ spec: id });
    
    if (!material) {
      return res.status(404).json({ 
        success: false, 
        message: '재료를 찾을 수 없습니다.' 
      });
    }
    
    res.json({ 
      success: true, 
      data: material,
      fromCache: false
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// UPDATE - 재료 수정
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // MongoDB ObjectId 형식인지 확인
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const material = isObjectId 
      ? await SteelMaterial.findById(id)
      : await SteelMaterial.findOne({ spec: id });
    
    if (!material) {
      return res.status(404).json({ 
        success: false, 
        message: '재료를 찾을 수 없습니다.' 
      });
    }

    // 데이터 타입 변환
    if (updateData.wpm !== undefined) updateData.wpm = parseFloat(updateData.wpm);
    if (updateData.method_calc !== undefined) updateData.method_calc = parseInt(updateData.method_calc);
    if (updateData.initial_length !== undefined) updateData.initial_length = parseFloat(updateData.initial_length);
    if (updateData.trade_unit !== undefined) updateData.trade_unit = parseInt(updateData.trade_unit);
    if (updateData.cat_product !== undefined) updateData.cat_product = parseInt(updateData.cat_product);

    // 업데이트
    Object.assign(material, updateData);
    await material.save();
    
    // 캐시 업데이트
    if (materialsCache.isLoaded) {
      const materialObj = material.toObject();
      const oldSpec = materialsCache.byId.get(material._id.toString())?.spec;
      
      // 기존 spec으로 찾아서 업데이트
      if (oldSpec && oldSpec !== materialObj.spec) {
        materialsCache.bySpec.delete(oldSpec);
      }
      
      // 배열에서 찾아서 업데이트
      const index = materialsCache.data.findIndex(m => m._id.toString() === material._id.toString());
      if (index !== -1) {
        materialsCache.data[index] = materialObj;
      } else {
        materialsCache.data.push(materialObj);
      }
      
      materialsCache.bySpec.set(materialObj.spec, materialObj);
      materialsCache.byId.set(materialObj._id.toString(), materialObj);
    }
    
    res.json({ 
      success: true, 
      message: '재료가 성공적으로 수정되었습니다.',
      data: material 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// UPDATE - 부분 수정 (PATCH)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // MongoDB ObjectId 형식인지 확인
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const material = isObjectId 
      ? await SteelMaterial.findById(id)
      : await SteelMaterial.findOne({ spec: id });
    
    if (!material) {
      return res.status(404).json({ 
        success: false, 
        message: '재료를 찾을 수 없습니다.' 
      });
    }

    // 데이터 타입 변환
    if (updateData.wpm !== undefined) updateData.wpm = parseFloat(updateData.wpm);
    if (updateData.method_calc !== undefined) updateData.method_calc = parseInt(updateData.method_calc);
    if (updateData.initial_length !== undefined) updateData.initial_length = parseFloat(updateData.initial_length);
    if (updateData.trade_unit !== undefined) updateData.trade_unit = parseInt(updateData.trade_unit);
    if (updateData.cat_product !== undefined) updateData.cat_product = parseInt(updateData.cat_product);

    // 부분 업데이트
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        material[key] = updateData[key];
      }
    });
    
    await material.save();
    
    // 캐시 업데이트
    if (materialsCache.isLoaded) {
      const materialObj = material.toObject();
      const oldSpec = materialsCache.byId.get(material._id.toString())?.spec;
      
      if (oldSpec && oldSpec !== materialObj.spec) {
        materialsCache.bySpec.delete(oldSpec);
      }
      
      const index = materialsCache.data.findIndex(m => m._id.toString() === material._id.toString());
      if (index !== -1) {
        materialsCache.data[index] = materialObj;
      } else {
        materialsCache.data.push(materialObj);
      }
      
      materialsCache.bySpec.set(materialObj.spec, materialObj);
      materialsCache.byId.set(materialObj._id.toString(), materialObj);
    }
    
    res.json({ 
      success: true, 
      message: '재료가 성공적으로 수정되었습니다.',
      data: material 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DELETE - 재료 삭제
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // MongoDB ObjectId 형식인지 확인
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const material = isObjectId 
      ? await SteelMaterial.findByIdAndDelete(id)
      : await SteelMaterial.findOneAndDelete({ spec: id });
    
    if (!material) {
      return res.status(404).json({ 
        success: false, 
        message: '재료를 찾을 수 없습니다.' 
      });
    }
    
    // 캐시에서 삭제
    if (materialsCache.isLoaded) {
      const materialObj = material.toObject();
      materialsCache.bySpec.delete(materialObj.spec);
      materialsCache.byId.delete(materialObj._id.toString());
      materialsCache.data = materialsCache.data.filter(m => m._id.toString() !== materialObj._id.toString());
    }
    
    res.json({ 
      success: true, 
      message: '재료가 성공적으로 삭제되었습니다.',
      data: material 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DELETE - 여러 재료 일괄 삭제
router.delete('/', async (req, res) => {
  try {
    const { ids, specs } = req.body;
    
    if (!ids && !specs) {
      return res.status(400).json({ 
        success: false, 
        error: 'ids 또는 specs 배열이 필요합니다.' 
      });
    }

    let query = {};
    if (ids && ids.length > 0) {
      query._id = { $in: ids };
    } else if (specs && specs.length > 0) {
      query.spec = { $in: specs };
    }

    const result = await SteelMaterial.deleteMany(query);
    
    // 캐시에서 삭제
    if (materialsCache.isLoaded && result.deletedCount > 0) {
      // 삭제된 항목들을 캐시에서 제거
      if (ids && ids.length > 0) {
        ids.forEach(id => {
          const material = materialsCache.byId.get(id.toString());
          if (material) {
            materialsCache.bySpec.delete(material.spec);
            materialsCache.byId.delete(id.toString());
          }
        });
      } else if (specs && specs.length > 0) {
        specs.forEach(spec => {
          const material = materialsCache.bySpec.get(spec);
          if (material) {
            materialsCache.byId.delete(material._id.toString());
            materialsCache.bySpec.delete(spec);
          }
        });
      }
      
      // 배열에서도 제거
      materialsCache.data = materialsCache.data.filter(m => {
        if (ids && ids.length > 0) {
          return !ids.includes(m._id.toString());
        } else if (specs && specs.length > 0) {
          return !specs.includes(m.spec);
        }
        return true;
      });
    }
    
    res.json({ 
      success: true, 
      message: `${result.deletedCount}개의 재료가 삭제되었습니다.`,
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// 수동 동기화 API - DB에서 캐시로 데이터 동기화
// ============================================
router.post('/sync', async (req, res) => {
  try {
    console.log('🔄 수동 동기화 요청 받음');
    const success = await loadCacheFromDB();
    
    if (success) {
      res.json({
        success: true,
        message: '캐시 동기화가 완료되었습니다.',
        data: {
          count: materialsCache.data.length,
          lastSync: materialsCache.lastSync
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: '캐시 동기화에 실패했습니다.'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 캐시 상태 조회 API
router.get('/cache/status', (req, res) => {
  res.json({
    success: true,
    data: {
      isLoaded: materialsCache.isLoaded,
      count: materialsCache.data.length,
      lastSync: materialsCache.lastSync
    }
  });
});

// 캐시 초기화 함수를 외부에서 사용할 수 있도록 export
module.exports = router;
module.exports.loadCacheFromDB = loadCacheFromDB;
module.exports.getCacheStatus = () => ({
  isLoaded: materialsCache.isLoaded,
  count: materialsCache.data.length,
  lastSync: materialsCache.lastSync
});

