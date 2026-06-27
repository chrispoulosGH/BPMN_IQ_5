require('dotenv').config();
const mongoose = require('mongoose');
const CSI = require('./models/ComponentSearchIndex');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bpmn_iq')
  .then(async () => {
    try {
      // Use aggregation to search nested arrays
      const result = await CSI.aggregate([
        {
          $match: {
            neighborhoodName: 'AT&T Journey',
            componentName: 'application'
          }
        },
        {
          $addFields: {
            hasCareHierarchy: {
              $anyElementTrue: {
                $map: {
                  input: '$cachedHierarchies',
                  as: 'hierarchy',
                  in: {
                    $anyElementTrue: {
                      $map: {
                        input: '$$hierarchy',
                        as: 'node',
                        in: {
                          $and: [
                            { $eq: ['$$node.rowName', 'Care'] },
                            { $eq: ['$$node.componentName', 'channel'] }
                          ]
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          $match: { hasCareHierarchy: true }
        },
        { $limit: 1 }
      ]).exec();

      if (result && result.length > 0) {
        const app = result[0];
        console.log('✅ Found APPLICATION entry with Care in hierarchy\n');
        console.log(`Application: ${app.rowName}\n`);
        
        const careHierarchy = app.cachedHierarchies.find(h => 
          h.some(n => n.rowName === 'Care' && n.componentName === 'channel')
        );
        
        if (careHierarchy) {
          console.log(`Hierarchy depth: ${careHierarchy.length}`);
          console.log('Full path:');
          careHierarchy.forEach((node, idx) => {
            console.log(`  [${idx}] ${node.componentName}: ${node.rowName}`);
          });
        }
      } else {
        console.log('❌ No APPLICATION entries with Care found!');
      }

    } catch (error) {
      console.error('Error:', error.message);
      console.error(error.stack);
    }
    
    mongoose.connection.close();
  })
  .catch(error => {
    console.error('Database connection error:', error.message);
    process.exit(1);
  });
